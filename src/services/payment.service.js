const crypto = require('crypto');
const env = require('../config/env');
const { prisma } = require('../db/prisma');
const { sendRedeemEmail } = require('./email.service');
const packageService = require('./package.service');
const logger = require('../utils/logger');

/**
 * Generate DOKU signature for request header.
 */
function generateSignature({ clientId, requestId, requestTimestamp, requestTarget, body, secretKey }) {
  let componentSignature = `Client-Id:${clientId}`;
  componentSignature += `\nRequest-Id:${requestId}`;
  componentSignature += `\nRequest-Timestamp:${requestTimestamp}`;
  componentSignature += `\nRequest-Target:${requestTarget}`;

  if (body) {
    const digest = crypto.createHash('sha256').update(JSON.stringify(body), 'utf-8').digest();
    const digestB64 = Buffer.from(digest).toString('base64');
    componentSignature += `\nDigest:${digestB64}`;
  }

  const hmac = crypto.createHmac('sha256', secretKey).update(componentSignature).digest();
  return `HMACSHA256=${Buffer.from(hmac).toString('base64')}`;
}

/**
 * Generate DOKU notification signature for verification.
 */
function verifyNotificationSignature(headers, body, notificationPath) {
  try {
    const clientId = headers['client-id'];
    const requestId = headers['request-id'];
    const requestTimestamp = headers['request-timestamp'];
    const signatureHeader = headers['signature'];

    if (!clientId || !requestId || !requestTimestamp || !signatureHeader) {
      return { valid: false, error: 'Missing notification headers' };
    }

    const receivedSig = signatureHeader.replace('HMACSHA256=', '');

    const digest = crypto.createHash('sha256').update(JSON.stringify(body), 'utf-8').digest();
    const digestB64 = Buffer.from(digest).toString('base64');

    let componentSignature = `Client-Id:${clientId}`;
    componentSignature += `\nRequest-Id:${requestId}`;
    componentSignature += `\nRequest-Timestamp:${requestTimestamp}`;
    componentSignature += `\nRequest-Target:${notificationPath}`;
    componentSignature += `\nDigest:${digestB64}`;

    const hmac = crypto.createHmac('sha256', env.doku.secretKey).update(componentSignature).digest();
    const computedSig = Buffer.from(hmac).toString('base64');

    if (computedSig !== receivedSig) {
      return { valid: false, error: 'Signature mismatch' };
    }

    return { valid: true };
  } catch (err) {
    logger.error({ err }, 'Error verifying notification signature');
    return { valid: false, error: err.message };
  }
}

/**
 * Buat DOKU Checkout payment + simpan record Payment ke DB.
 * @param {object} opts { userId, email, name, plan, amount }
 * @returns {Promise<{ sessionId: string, paymentUrl: string, externalId: string }>}
 */
async function createPayment({ userId, email, name, packageId, plan = 'basic', amount = 29000, durationDays = 30 }) {
  const externalId = `YF-${userId}-${Date.now()}`;
  const invoiceNumber = externalId;

  const requestBody = {
    order: {
      amount,
      invoice_number: invoiceNumber,
      currency: 'IDR',
      callback_url: env.doku.callbackUrl,
      auto_redirect: true,
    },
    payment: {
      payment_due_date: 1440,
    },
    customer: {
      id: userId,
      name: name || email.split('@')[0],
      email,
    },
  };

  const requestId = crypto.randomUUID();
  const requestTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const signature = generateSignature({
    clientId: env.doku.clientId,
    requestId,
    requestTimestamp,
    requestTarget: '/checkout/v1/payment',
    body: requestBody,
    secretKey: env.doku.secretKey,
  });

  const response = await fetch(`${env.doku.apiUrl}/checkout/v1/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-Id': env.doku.clientId,
      'Request-Id': requestId,
      'Request-Timestamp': requestTimestamp,
      'Signature': signature,
    },
    body: JSON.stringify(requestBody),
  });

  const responseData = await response.json();

  if (!response.ok) {
    logger.error({ status: response.status, responseData }, 'DOKU checkout API error');
    throw new Error(responseData.error_messages?.join(', ') || 'DOKU checkout failed');
  }

  const paymentUrl = responseData.response?.payment?.url;
  const sessionId = responseData.response?.order?.session_id;

  if (!paymentUrl) {
    throw new Error('payment.url not found in DOKU response');
  }

  await prisma.payment.create({
    data: {
      userId,
      externalId,
      invoiceId: sessionId || invoiceNumber,
      amount,
      currency: 'IDR',
      status: 'PENDING',
      description: `YorFinance ${plan} — ${email}`,
    },
  });

  logger.info({ externalId, sessionId, email, amount, plan, packageId }, 'DOKU checkout diburat');

  return {
    sessionId,
    paymentUrl,
    externalId,
  };
}

/**
 * Verifikasi & proses notification dari DOKU.
 * @param {object} headers - request headers
 * @param {object} body - notification body
 * @param {string} notificationPath - path of our notification endpoint
 * @returns {Promise<{ success: boolean }>}
 */
async function handleWebhook(headers, body, notificationPath) {
  const verification = verifyNotificationSignature(headers, body, notificationPath);

  if (!verification.valid) {
    logger.warn({ error: verification.error }, 'DOKU notification signature invalid');
    return { success: false, error: verification.error };
  }

  const { order, transaction } = body;
  const invoiceNumber = order?.invoice_number;
  const status = transaction?.status;
  const paidAt = transaction?.date;
  const channel = body.channel?.id;

  logger.info({ invoiceNumber, status, channel }, 'DOKU notification diterima');

  const payment = await prisma.payment.findUnique({
    where: { externalId: invoiceNumber },
  });

  if (!payment) {
    logger.warn({ externalId: invoiceNumber }, 'Payment record tidak ditemukan');
    return { success: false, error: 'Payment not found' };
  }

  if (status === 'SUCCESS') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        paidAt: paidAt ? new Date(paidAt) : new Date(),
        paymentMethod: body.service?.id || null,
        paymentChannel: channel || null,
      },
    });

    const parts = invoiceNumber.split('-');
    const userId = parts.slice(1, -1).join('-');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!user) {
      logger.warn({ userId }, 'User tidak ditemukan untuk notification ini');
      return { success: false, error: 'User not found' };
    }

    // Resolve plan slug and duration from package
    const descMatch = payment.description?.match(/^YorFinance (\w+) —/);
    const planSlug = descMatch ? descMatch[1] : 'basic';
    let durationDays = 30;
    try {
      const pkg = await packageService.getPackageBySlug(planSlug);
      if (pkg) durationDays = pkg.durationDays;
    } catch (_) {}

    if (user.subscription) {
      const currentExpiry = user.subscription.expiresAt > new Date()
        ? user.subscription.expiresAt
        : new Date();
      const newExpiry = new Date(currentExpiry.getTime() + durationDays * 24 * 60 * 60 * 1000);

      await prisma.subscription.update({
        where: { id: user.subscription.id },
        data: {
          status: 'ACTIVE',
          activatedAt: user.subscription.activatedAt || new Date(),
          startedAt: user.subscription.startedAt || new Date(),
          expiresAt: newExpiry,
        },
      });

      logger.info({ userId, newExpiry }, 'Subscription diperpanjang');
    } else {
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
    }
  } else if (status === 'FAILED') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED' },
    });
  }

  return { success: true };
}

module.exports = { createPayment, handleWebhook, verifyNotificationSignature, generateSignature };
