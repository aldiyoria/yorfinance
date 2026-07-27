const { prisma } = require('../db/prisma');
const { handleWebhook, generateCallbackSignature } = require('../services/payment.service');
const logger = require('../utils/logger');

/**
 * POST /api/sandbox/payment-callback
 * Body: { externalId, status? }
 * Simulate iPaymu callback tanpa perlu iPaymu real.
 * status_code: 1 = success, 0 = pending, -2 = expired
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

    const statusMap = {
      'SUCCESS': 1,
      'success': 1,
      'FAILED': -2,
      'failed': -2,
      'PENDING': 0,
      'pending': 0,
    };
    const statusCode = statusMap[status] !== undefined ? statusMap[status] : 1;

    const fakeBody = {
      buyer_email: payment.description?.split(' — ')[1] || 'test@email.com',
      buyer_name: 'Sandbox User',
      buyer_phone: '08123456789',
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      expired_at: new Date(Date.now() + 3600000).toISOString().replace('T', ' ').slice(0, 19),
      fee: '0',
      paid_at: statusCode === 1 ? new Date().toISOString().replace('T', ' ').slice(0, 19) : '',
      reference_id: externalId,
      sid: `SANDBOX-${Date.now()}`,
      status: statusCode === 1 ? 'berhasil' : statusCode === 0 ? 'pending' : 'expired',
      status_code: String(statusCode),
      status_desc: statusCode === 1 ? 'Success' : statusCode === 0 ? 'Pending' : 'Expired',
      channel: 'bca',
      paid_off: payment.amount,
      product: 'YorFinance sandbox',
      quantity: '1',
      merchant: '0000000000000',
      merchant_name: 'YorFinance Sandbox',
      system_notes: 'Sandbox simulation',
      trscode: `SBX${Date.now()}`,
      trx_id: Math.floor(Math.random() * 100000000),
      unique_code: '0',
      via: 'va',
      payment_no: '1234567890',
      va: '1234567890',
      url: '',
      additional_info: [],
      transaction_status_code: String(statusCode),
      settlement_status: 'unsettle',
      settlement_date: '',
      expired_time: '3600',
      expired_unix: String(Math.floor(Date.now() / 1000) + 3600),
      is_escrow: '0',
      is_refund: '0',
      is_sandbox: 'true',
      total: String(payment.amount),
      amount: String(payment.amount),
      sub_total: String(payment.amount),
    };

    const signature = generateCallbackSignature(fakeBody);

    logger.info({ externalId, statusCode }, 'SANDBOX: Simulating iPaymu callback');

    const result = await handleWebhook(fakeBody, signature);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const updatedPayment = await prisma.payment.findUnique({
      where: { externalId },
      include: { user: true },
    });

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
      message: `Sandbox callback berhasil! Status: ${fakeBody.status} (code: ${statusCode})`,
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
    logger.error({ err }, 'SANDBOX: Error simulasi callback');
    return res.status(500).json({ error: 'Gagal simulasi callback', detail: err.message });
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
