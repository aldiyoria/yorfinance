const { subscribe } = require('../services/subscription.service');
const { prisma } = require('../db/prisma');
const logger = require('../utils/logger');

/**
 * POST /api/subscriptions
 * Body: { email, name?, plan?, durationDays? }
 * Membuat subscription baru + kirim email redeem code.
 */
async function createSubscription(req, res) {
  try {
    const { email, name, plan, durationDays } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Field "email" wajib diisi.' });
    }

    const { user, subscription } = await subscribe({ email, name, plan, durationDays });

    return res.status(201).json({
      message: 'Subscription berhasil dibuat. Kode redeem telah dikirim ke email.',
      redeemCode: subscription.redeemCode,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        expiresAt: subscription.expiresAt,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Gagal membuat subscription');
    return res.status(500).json({ error: 'Gagal membuat subscription', detail: err.message });
  }
}

/**
 * GET /api/subscriptions/:id/redeem-code
 * Ambil redeem code berdasarkan subscription ID.
 */
async function getRedeemCode(req, res) {
  try {
    const { id } = req.params;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription tidak ditemukan.' });
    }

    return res.json({
      subscriptionId: subscription.id,
      redeemCode: subscription.redeemCode,
      status: subscription.status,
      plan: subscription.plan,
      expiresAt: subscription.expiresAt,
      user: {
        email: subscription.user.email,
        name: subscription.user.name,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Gagal mengambil redeem code');
    return res.status(500).json({ error: 'Gagal mengambil redeem code', detail: err.message });
  }
}

module.exports = { createSubscription, getRedeemCode };
