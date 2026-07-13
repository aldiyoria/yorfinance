const { prisma } = require('../db/prisma');
const { handleWebhook, generateSignature } = require('../services/payment.service');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * POST /api/sandbox/payment-callback
 * Body: { externalId, status? }
 * Simulate DOKU notification tanpa perlu DOKU real.
 */
async function simulatePaymentCallback(req, res) {
  try {
    const { externalId, status } = req.body;

    if (!externalId) {
      return res.status(400).json({ error: 'Field "externalId" wajib diisi.' });
    }

    const payment = await prisma.payment.findUnique({
      where: { externalId },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment tidak ditemukan. Buat checkout dulu via /api/payments/create.' });
    }

    const fakeBody = {
      service: { id: 'VIRTUAL_ACCOUNT' },
      acquirer: { id: 'BCA' },
      channel: { id: 'VIRTUAL_ACCOUNT_BCA' },
      order: {
        invoice_number: externalId,
        amount: payment.amount,
      },
      transaction: {
        status: status || 'SUCCESS',
        date: new Date().toISOString(),
        original_request_id: payment.invoiceId || `sandbox-${Date.now()}`,
      },
    };

    const fakeHeaders = {
      'client-id': env.doku.clientId,
      'request-id': require('crypto').randomUUID(),
      'request-timestamp': new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      'signature': '',
    };

    const notificationPath = '/api/payments/callback';
    const computedSignature = generateSignature({
      clientId: env.doku.clientId,
      requestId: fakeHeaders['request-id'],
      requestTimestamp: fakeHeaders['request-timestamp'],
      requestTarget: notificationPath,
      body: fakeBody,
      secretKey: env.doku.secretKey,
    });
    fakeHeaders['signature'] = computedSignature;

    logger.info({ externalId, status: fakeBody.transaction.status }, 'SANDBOX: Simulating DOKU notification');

    const result = await handleWebhook(fakeHeaders, fakeBody, notificationPath);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const updatedPayment = await prisma.payment.findUnique({
      where: { externalId },
      include: { user: true },
    });

    // Cari subscription terbaru milik user
    let sub = null;
    if (updatedPayment.user) {
      const subs = await prisma.subscription.findMany({
        where: { userId: updatedPayment.user.id },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      sub = subs[0] || null;
    }

    return res.json({
      message: `Sandbox notification berhasil! Status: ${fakeBody.transaction.status}`,
      payment: {
        id: updatedPayment.id,
        externalId: updatedPayment.externalId,
        status: updatedPayment.status,
        paidAt: updatedPayment.paidAt,
        paymentMethod: updatedPayment.paymentMethod,
        paymentChannel: updatedPayment.paymentChannel,
      },
      subscription: sub ? {
        status: sub.status,
        redeemCode: sub.redeemCode,
        expiresAt: sub.expiresAt,
      } : null,
    });
  } catch (err) {
    logger.error({ err }, 'SANDBOX: Error simulasi notification');
    return res.status(500).json({ error: 'Gagal simulasi notification', detail: err.message });
  }
}

/**
 * POST /api/sandbox/reset-user
 * Body: { email }
 * Reset user data untuk testing ulang.
 */
async function resetUser(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Field "email" wajib diisi.' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { subscription: true, payments: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User tidak ditemukan.' });
    }

    // Hapus payments, subscription, lalu user
    await prisma.payment.deleteMany({ where: { userId: user.id } });
    if (user.subscription) {
      await prisma.subscription.delete({ where: { userId: user.id } });
    }
    await prisma.user.delete({ where: { id: user.id } });

    logger.info({ email }, 'SANDBOX: User direset');

    return res.json({ message: `User ${email} berhasil dihapus. Siap testing ulang.` });
  } catch (err) {
    logger.error({ err }, 'SANDBOX: Error reset user');
    return res.status(500).json({ error: 'Gagal reset user', detail: err.message });
  }
}

/**
 * GET /api/sandbox/payments
 * List semua payments (tanpa auth, untuk debugging).
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
      take: 20,
    });

    return res.json({
      count: payments.length,
      payments: payments.map((p) => ({
        id: p.id,
        externalId: p.externalId,
        invoiceId: p.invoiceId,
        amount: p.amount,
        status: p.status,
        paymentMethod: p.paymentMethod,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        user: p.user,
      })),
    });
  } catch (err) {
    logger.error({ err }, 'SANDBOX: Error list payments');
    return res.status(500).json({ error: 'Gagal list payments' });
  }
}

module.exports = { simulatePaymentCallback, resetUser, listPayments };
