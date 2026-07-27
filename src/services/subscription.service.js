const { prisma } = require('../db/prisma');
const { sendRedeemEmail } = require('./email.service');
const logger = require('../utils/logger');
const crypto = require('crypto');

const REDEEM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRedeemCode() {
  return Array.from({ length: 6 }, () =>
    REDEEM_CODE_CHARS[Math.floor(Math.random() * REDEEM_CODE_CHARS.length)]
  ).join('');
}

function generateDashboardToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Cari subscription yang harus dipakai user.
 * Prioritas: ACTIVE + belum expired, urut dibuat terbaru.
 */
async function findActiveSubscription(userId) {
  const subs = await prisma.subscription.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  return subs[0] || null;
}

/**
 * Cari subscription PENDING (belum di-redeem) yang belum expired, urut terbaru.
 */
async function findPendingSubscription(userId) {
  const subs = await prisma.subscription.findMany({
    where: {
      userId,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  return subs[0] || null;
}

/**
 * Cek apakah chatId Telegram punya subscription aktif.
 * @returns {Promise<{ active: boolean, user: object|null, needsRedeem: boolean }>}
 */
async function checkAccess(chatId) {
  const user = await prisma.user.findUnique({
    where: { chatId: String(chatId) },
  });

  if (!user) return { active: false, user: null, needsRedeem: false, subscription: null };

  const pendingSub = await findPendingSubscription(user.id);
  if (pendingSub) {
    return { active: false, user, needsRedeem: true, subscription: null };
  }

  const activeSub = await findActiveSubscription(user.id);
  if (activeSub) {
    return { active: true, user, needsRedeem: false, subscription: activeSub };
  }

  return { active: false, user, needsRedeem: false, subscription: null };
}

/**
 * Redeem kode: aktivasi subscription dan nonaktifkan subscription lain.
 * @param {number|string} chatId - Telegram chat ID
 * @param {string} code - 6 karakter redeem code
 */
async function redeemCode(chatId, code) {
  const sub = await prisma.subscription.findUnique({
    where: { redeemCode: code.toUpperCase() },
    include: { user: true },
  });

  if (!sub) return { success: false, message: 'Kode redeem tidak valid.' };

  if (sub.status !== 'PENDING') {
    return { success: false, message: 'Kode redeem sudah digunakan.' };
  }

  if (sub.expiresAt <= new Date()) {
    return { success: false, message: 'Kode redeem sudah kedaluwarsa.' };
  }

  // Cek apakah user yang punya code ini sudah punya chatId (sudah diredeem orang lain)
  if (sub.user.chatId && sub.user.chatId !== String(chatId)) {
    return { success: false, message: 'Kode redeem sudah digunakan oleh orang lain.' };
  }

  // Cek apakah chatId ini sudah punya subscription aktif (belum expired)
  const existingUser = await prisma.user.findUnique({
    where: { chatId: String(chatId) },
  });

  if (existingUser) {
    const activeSub = await findActiveSubscription(existingUser.id);
    if (activeSub) {
      return { success: false, message: 'Anda sudah memiliki subscription aktif.' };
    }
  }

  const now = new Date();
  const dashboardToken = generateDashboardToken();

  // Connect chatId ke user (buat user baru jika perlu atau update existing)
  let user;
  if (existingUser) {
    user = existingUser;
    if (!user.dashboardToken) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { dashboardToken },
      });
    }
  } else {
    user = await prisma.user.update({
      where: { id: sub.userId },
      data: { chatId: String(chatId), dashboardToken },
    });
  }

  // Nonaktifkan subscription lain milik user ini yang masih ACTIVE (misal trial)
  // agar tidak bentrok dengan subscription baru
  await prisma.subscription.updateMany({
    where: {
      userId: user.id,
      id: { not: sub.id },
      status: 'ACTIVE',
    },
    data: { status: 'CANCELLED' },
  });

  // Aktivasi subscription yang di-redeem
  const updatedSub = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: 'ACTIVE',
      activatedAt: now,
      startedAt: now,
    },
  });

  logger.info({ chatId, redeemCode: code, plan: sub.plan }, 'Redeem berhasil');

  // Kirim email info aktivasi
  try {
    const userName = user.name || user.email.split('@')[0];
    await sendRedeemEmail({
      to: user.email,
      name: userName,
      redeemCode: code.toUpperCase(),
      plan: sub.plan || 'basic',
    });
  } catch (err) {
    logger.error({ err, email: user.email }, 'Gagal kirim email info aktivasi');
  }

  return {
    success: true,
    message: 'Aktivasi berhasil! Mulai catat keuangan Anda.',
    user,
    subscription: updatedSub,
  };
}

/**
 * Buat subscription baru (oleh admin via API).
 * @param {object} opts { email, name, plan, durationDays }
 */
async function subscribe({ email, name, plan = 'basic', durationDays = 30 }) {
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  let redeemCode = generateRedeemCode();
  let attempts = 0;
  while (attempts < 10) {
    const existing = await prisma.subscription.findUnique({ where: { redeemCode } });
    if (!existing) break;
    redeemCode = generateRedeemCode();
    attempts++;
  }

  const user = await prisma.user.create({
    data: { email, name },
  });

  const subscription = await prisma.subscription.create({
    data: {
      userId: user.id,
      plan,
      redeemCode,
      expiresAt,
    },
  });

  // Kirim email redeem code
  try {
    await sendRedeemEmail({ to: email, redeemCode });
    logger.info({ email, plan, redeemCode }, 'Subscription dibuat & email terkirim');
  } catch (err) {
    logger.error({ err, email }, 'Gagal kirim email redeem code');
    logger.info({ email, plan, redeemCode }, 'Subscription dibuat (email gagal)');
  }

  return { user, subscription };
}

async function ensureDashboardToken(user) {
  if (user.dashboardToken) return user.dashboardToken;
  const token = generateDashboardToken();
  await prisma.user.update({
    where: { id: user.id },
    data: { dashboardToken: token },
  });
  return token;
}

module.exports = { checkAccess, redeemCode, subscribe, generateRedeemCode, ensureDashboardToken };
