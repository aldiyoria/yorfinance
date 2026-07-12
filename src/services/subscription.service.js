const { prisma } = require('../db/prisma');
const { createUserSheet } = require('./sheets.service');
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
 * Cek apakah chatId Telegram punya subscription aktif.
 * @returns {Promise<{ active: boolean, user: object|null, needsRedeem: boolean }>}
 */
async function checkAccess(chatId) {
  const user = await prisma.user.findUnique({
    where: { chatId: String(chatId) },
    include: { subscription: true },
  });

  if (!user) return { active: false, user: null, needsRedeem: false };

  if (!user.subscription) return { active: false, user, needsRedeem: false };

  if (user.subscription.status === 'PENDING') {
    return { active: false, user, needsRedeem: true };
  }

  const sub = user.subscription;
  const isActive = sub.status === 'ACTIVE' && sub.expiresAt > new Date();
  return { active: isActive, user, needsRedeem: false };
}

/**
 * Redeem kode: hubungkan chatId user dengan subscription, buat sheet terproteksi.
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

  // Cek apakah chatId ini sudah punya subscription aktif
  const existingUser = await prisma.user.findUnique({
    where: { chatId: String(chatId) },
    include: { subscription: true },
  });

  if (existingUser && existingUser.subscription) {
    return { success: false, message: 'Anda sudah memiliki subscription aktif.' };
  }

  const now = new Date();
  const dashboardToken = generateDashboardToken();
  const user = await prisma.user.update({
    where: { id: sub.userId },
    data: { chatId: String(chatId), dashboardToken },
  });

  const updatedSub = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: 'ACTIVE',
      activatedAt: now,
      startedAt: now,
    },
  });

  logger.info({ chatId, redeemCode: code }, 'Redeem berhasil');

  // Auto-create sheet terproteksi jika belum punya
  if (!user.sheetId) {
    const userName = user.name || user.email.split('@')[0];
    const { sheetId, sheetName } = await createUserSheet({
      userName,
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { sheetId, sheetName },
    });

    // Kirim email berisi info sheet
    try {
      await sendRedeemEmail({
        to: user.email,
        redeemCode: code.toUpperCase(),
        sheetName,
      });
    } catch (err) {
      logger.error({ err, email: user.email }, 'Gagal kirim email info sheet');
    }
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

/**
 * Generate dashboard token for user if not exists.
 * @param {object} user
 * @returns {Promise<string>} dashboard token
 */
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
