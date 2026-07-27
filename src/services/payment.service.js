const crypto = require('crypto');
const env = require('../config/env');
const { prisma } = require('../db/prisma');
const { sendRedeemEmail } = require('./email.service');
const packageService = require('./package.service');
const logger = require('../utils/logger');

/**
 * Generate iPaymu signature for request header.
 * Formula: HMAC-SHA256("POST:${va}:${SHA256(body)}:${apiKey}", apiKey)
 */
function generateSignature(body) {
  const bodyJson = JSON.stringify(body);
  const bodyHash = crypto.createHash('sha256').update(bodyJson, 'utf-8').digest('hex');
  const stringToSign = `POST:${env.ipaymu.va}:${bodyHash}:${env.ipaymu.apiKey}`;
  return crypto.createHmac('sha256', env.ipaymu.apiKey).update(stringToSign).digest('hex');
}

/**
 * Sort object keys ascending (A-Z) — required for iPaymu callback verification.
 */
function sortKeys(obj) {
  return Object.keys(obj)
    .sort((a, b) => a.localeCompare(b))
    .reduce((sorted, key) => {
      sorted[key] = obj[key];
      return sorted;
    }, {});
}

/**
 * Normalize callback data types for signature verification.
 */
function normalizeCallbackData(rawData) {
  const result = {};
  for (const key of Object.keys(rawData)) {
    let val = rawData[key];
    if (key === 'is_escrow') {
      result[key] = (val === 'true' || val === '1' || val === 1);
    } else if (['trx_id', 'status_code', 'transaction_status_code', 'paid_off'].includes(key)) {
      result[key] = parseInt(val, 10);
    } else if (key === 'additional_info') {
      result[key] = (val === '[]' || Array.isArray(val)) ? [] : val;
    } else {
      result[key] = String(val);
    }
  }
  if (!result.hasOwnProperty('additional_info')) {
    result['additional_info'] = [];
  }
  return result;
}

/**
 * Verify iPaymu callback signature.
 * Uses VA number as secret key.
 */
function verifyCallbackSignature(body, receivedSignature) {
  try {
    const normalized = normalizeCallbackData(body);
    if (normalized.signature) delete normalized.signature;

    const sorted = sortKeys(normalized);
    let jsonBody = JSON.stringify(sorted);
    jsonBody = jsonBody.replace(/\//g, '\\/');

    const calculatedSignature = crypto
      .createHmac('sha256', env.ipaymu.va)
      .update(jsonBody)
      .digest('hex');

    return calculatedSignature === receivedSignature;
  } catch (err) {
    logger.error({ err }, 'Error verifying iPaymu callback signature');
    return false;
  }
}

/**
 * Buat iPaymu Redirect Payment + simpan record Payment ke DB.
 * @param {object} opts { userId, email, name, packageId, plan, amount, durationDays }
 * @returns {Promise<{ paymentId: string, paymentUrl: string, externalId: string }>}
 */
async function createPayment({ userId, email, name, packageId, plan = 'basic', amount = 29000, durationDays = 30 }) {
  const externalId = `YF-${userId}-${Date.now()}`;

  const requestBody = {
    product: ['YorFinance ' + plan],
    qty: ['1'],
    price: [String(amount)],
    amount: String(amount),
    returnUrl: `${env.dashboardBaseUrl}/web/success.html?order_id=${externalId}`,
    cancelUrl: `${env.dashboardBaseUrl}/web/failed.html?order_id=${externalId}`,
    notifyUrl: env.ipaymu.callbackUrl,
    referenceId: externalId,
    buyerName: name || email.split('@')[0],
    buyerEmail: email,
  };

  const signature = generateSignature(requestBody);

  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);

  const response = await fetch(`${env.ipaymu.apiUrl}/api/v2/payment`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'va': env.ipaymu.va,
      'signature': signature,
      'timestamp': timestamp,
    },
    body: JSON.stringify(requestBody),
  });

  const responseData = await response.json();

  // iPaymu response: { Status: 200, Success: true, Message: "...", Data: { SessionID, Url } }
  if (!response.ok || responseData.Status !== 200) {
    logger.error({ status: response.status, responseData }, 'iPaymu payment API error');
    throw new Error(responseData.Message || 'iPaymu payment failed');
  }

  const paymentUrl = responseData.Data?.Url;
  const sessionId = responseData.Data?.SessionID;

  if (!paymentUrl) {
    throw new Error('Url not found in iPaymu response');
  }

  await prisma.payment.create({
    data: {
      userId,
      externalId,
      invoiceId: sessionId || externalId,
      amount,
      currency: 'IDR',
      status: 'PENDING',
      description: `YorFinance ${plan} — ${email}`,
    },
  });

  logger.info({ externalId, sessionId, email, amount, plan, packageId }, 'iPaymu payment dibuat');

  return {
    sessionId,
    paymentUrl,
    externalId,
  };
}

/**
 * Verifikasi & proses callback dari iPaymu.
 * @param {object} body - callback body (form-encoded atau JSON)
 * @param {string} receivedSignature - signature dari header X-Signature
 * @returns {Promise<{ success: boolean }>}
 */
async function handleWebhook(body, receivedSignature) {
  if (!verifyCallbackSignature(body, receivedSignature)) {
    logger.warn('iPaymu callback signature invalid');
    return { success: false, error: 'Invalid signature' };
  }

  const referenceId = body.reference_id;
  const statusCode = parseInt(body.status_code, 10);
  const paidAt = body.paid_at;
  const channel = body.channel;
  const via = body.via;

  logger.info({ referenceId, statusCode, channel, via }, 'iPaymu callback diterima');

  const payment = await prisma.payment.findUnique({
    where: { externalId: referenceId },
  });

  if (!payment) {
    logger.warn({ externalId: referenceId }, 'Payment record tidak ditemukan');
    return { success: false, error: 'Payment not found' };
  }

  // status_code: 1 = success, 0 = pending, -2 = expired
  if (statusCode === 1) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        paidAt: paidAt ? new Date(paidAt) : new Date(),
        paymentMethod: via || null,
        paymentChannel: channel || null,
      },
    });

    const parts = referenceId.split('-');
    const userId = parts.slice(1, -1).join('-');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!user) {
      logger.warn({ userId }, 'User tidak ditemukan untuk callback ini');
      return { success: false, error: 'User not found' };
    }

    const descMatch = payment.description?.match(/^YorFinance (\w+) —/);
    const planSlug = descMatch ? descMatch[1] : 'basic';
    let durationDays = 30;
    try {
      const pkg = await packageService.getPackageBySlug(planSlug);
      if (pkg) durationDays = pkg.durationDays;
    } catch (_) {}

    const { generateRedeemCode } = require('./subscription.service');
    let redeemCode = generateRedeemCode();

    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.subscription.findUnique({ where: { redeemCode } });
      if (!existing) break;
      redeemCode = generateRedeemCode();
      attempts++;
    }

    const now = new Date();
    await prisma.subscription.create({
      data: {
        userId: user.id,
        plan: planSlug,
        redeemCode,
        status: 'PENDING',
        expiresAt: new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000),
      },
    });

    try {
      await sendRedeemEmail({
        to: user.email,
        name: user.name,
        redeemCode,
        plan: planSlug,
      });
      logger.info({ email: user.email, redeemCode }, 'Redeem code dikirim via email');
    } catch (err) {
      logger.error({ err, email: user.email }, 'Gagal kirim email redeem code');
    }
  } else if (statusCode === -2) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'EXPIRED' },
    });
  }
  // statusCode === 0 => still pending, no action needed

  return { success: true };
}

/**
 * Generate signature untuk sandbox simulasi callback.
 */
function generateCallbackSignature(body) {
  const normalized = normalizeCallbackData(body);
  const sorted = sortKeys(normalized);
  let jsonBody = JSON.stringify(sorted);
  jsonBody = jsonBody.replace(/\//g, '\\/');
  return crypto.createHmac('sha256', env.ipaymu.va).update(jsonBody).digest('hex');
}

module.exports = {
  createPayment,
  handleWebhook,
  generateSignature,
  generateCallbackSignature,
  verifyCallbackSignature,
};
