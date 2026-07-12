const { prisma } = require('../db/prisma');
const { createPayment, handleWebhook } = require('../services/payment.service');
const logger = require('../utils/logger');

/**
 * POST /api/payments/create
 * Body: { email, name?, plan? }
 * Buat DOKU Checkout → return payment URL untuk pembayaran.
 */
async function createInvoice(req, res) {
  try {
    const { email, name, plan } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Field "email" wajib diisi.' });
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
      plan: plan || 'basic',
      amount: 29000,
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
    });
  } catch (err) {
    logger.error({ err }, 'Gagal membuat checkout');
    return res.status(500).json({ error: 'Gagal membuat checkout', detail: err.message });
  }
}

/**
 * POST /api/payments/callback
 * HTTP Notification dari DOKU.
 */
async function paymentCallback(req, res) {
  try {
    const notificationPath = '/api/payments/callback';

    const result = await handleWebhook(req.headers, req.body, notificationPath);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    logger.error({ err }, 'DOKU notification error');
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
      include: {
        user: {
          include: { subscription: true },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment tidak ditemukan.' });
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
      subscription: payment.user.subscription ? {
        status: payment.user.subscription.status,
        redeemCode: payment.user.subscription.status === 'PENDING' ? payment.user.subscription.redeemCode : undefined,
        expiresAt: payment.user.subscription.expiresAt,
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
