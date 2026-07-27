const { prisma } = require('../db/prisma');
const { createPayment, handleWebhook } = require('../services/payment.service');
const packageService = require('../services/package.service');
const logger = require('../utils/logger');

/**
 * POST /api/payments/create
 * Body: { email, name?, packageId?, plan? }
 * Buat iPaymu Redirect Payment → return payment URL untuk pembayaran.
 */
async function createInvoice(req, res) {
  try {
    const { email, name, packageId, plan } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Field "email" wajib diisi.' });
    }

    let pkg = null;
    if (packageId) {
      pkg = await packageService.getPackageById(packageId);
      if (!pkg || !pkg.isActive) {
        return res.status(400).json({ error: 'Paket tidak valid atau tidak aktif.' });
      }
    } else {
      const slug = plan || 'basic';
      pkg = await packageService.getPackageBySlug(slug);
      if (!pkg || !pkg.isActive) {
        pkg = { slug: 'basic', name: 'Basic', price: 29000, durationDays: 30 };
      }
    }

    let user = await prisma.user.findFirst({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: { email, name: name || email.split('@')[0] },
      });
    }

    const { sessionId, paymentUrl, externalId } = await createPayment({
      userId: user.id,
      email: user.email,
      name: user.name,
      packageId: pkg.id || null,
      plan: pkg.slug,
      amount: pkg.price,
      durationDays: pkg.durationDays,
    });

    return res.status(201).json({
      message: 'Checkout berhasil dibuat.',
      sessionId,
      paymentUrl,
      externalId,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      package: {
        slug: pkg.slug,
        name: pkg.name,
        price: pkg.price,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Gagal membuat checkout');
    return res.status(500).json({ error: 'Gagal membuat checkout', detail: err.message });
  }
}

/**
 * POST /api/payments/callback
 * Callback notification dari iPaymu.
 * iPaymu mengirim body sebagai application/x-www-form-urlencoded atau application/json.
 * Signature dikirim di header X-Signature.
 */
async function paymentCallback(req, res) {
  try {
    const receivedSignature = req.headers['x-signature'];
    const contentType = req.headers['content-type'];

    logger.info({ contentType, hasBody: !!req.body, bodyType: typeof req.body }, 'iPaymu callback diterima');

    if (!receivedSignature) {
      logger.warn({ headers: req.headers }, 'iPaymu callback: Missing X-Signature header');
      return res.status(400).json({ error: 'Missing X-Signature header' });
    }

    // iPaymu bisa mengirim form-encoded atau JSON
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) {}
    }

    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      logger.error({ rawBody: req.body, bodyType: typeof req.body }, 'iPaymu callback: body kosong atau tidak ter-parse');
      return res.status(400).json({ error: 'Empty or unparseable body' });
    }

    logger.info({ keys: Object.keys(body), referenceId: body.reference_id || body.referenceId, status: body.status_code }, 'iPaymu callback body content');

    const result = await handleWebhook(body, receivedSignature);

    if (!result.success) {
      logger.warn({ error: result.error, referenceId: body.reference_id }, 'iPaymu callback ditolak');
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    logger.error({ err }, 'iPaymu callback error');
    return res.status(500).json({ error: 'Internal error' });
  }
}

/**
 * GET /api/payments/status/:externalId
 * Cek status pembayaran berdasarkan external ID.
 */
async function getPaymentStatus(req, res) {
  try {
    const { externalId } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { externalId },
      include: { user: true },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment tidak ditemukan.' });
    }

    let sub = null;
    if (payment.user) {
      const subs = await prisma.subscription.findMany({
        where: { userId: payment.user.id },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      sub = subs[0] || null;
    }

    return res.json({
      payment: {
        id: payment.id,
        externalId: payment.externalId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        paymentMethod: payment.paymentMethod,
        paymentChannel: payment.paymentChannel,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
      },
      user: {
        email: payment.user.email,
        name: payment.user.name,
      },
      subscription: sub ? {
        status: sub.status,
        redeemCode: sub.status === 'PENDING' ? sub.redeemCode : undefined,
        expiresAt: sub.expiresAt,
      } : null,
    });
  } catch (err) {
    logger.error({ err }, 'Gagal cek status pembayaran');
    return res.status(500).json({ error: 'Gagal cek status' });
  }
}

/**
 * GET /api/payments
 * List semua payments (admin only).
 */
async function listPayments(req, res) {
  try {
    const payments = await prisma.payment.findMany({
      include: {
        user: {
          select: { email: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return res.json({
      payments: payments.map((p) => ({
        id: p.id,
        externalId: p.externalId,
        amount: p.amount,
        status: p.status,
        paymentMethod: p.paymentMethod,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        user: p.user,
      })),
    });
  } catch (err) {
    logger.error({ err }, 'Gagal list payments');
    return res.status(500).json({ error: 'Gagal list payments' });
  }
}

module.exports = { createInvoice, paymentCallback, getPaymentStatus, listPayments };
