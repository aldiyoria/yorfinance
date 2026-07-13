const { prisma } = require('../db/prisma');
const { sendTrialEmail } = require('../services/email.service');
const { generateRedeemCode } = require('../services/subscription.service');
const logger = require('../utils/logger');

/**
 * Ambil paket free trial dari DB.
 * @returns {object|null} package atau null jika tidak ada
 */
async function getTrialPackage() {
  return prisma.package.findFirst({
    where: { isFreeTrial: true, isActive: true },
  });
}

/**
 * POST /api/trial
 * Public endpoint — buat free trial berdasarkan config di tabel Package.
 * Body: { email, name? }
 */
async function createTrial(req, res) {
  try {
    const { email, name } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Field "email" wajib diisi.' });
    }

    // Ambil paket free trial dari DB
    const trialPkg = await getTrialPackage();
    if (!trialPkg) {
      return res.status(503).json({ error: 'Free trial belum tersedia saat ini.' });
    }

    const trialDays = trialPkg.trialDays;
    const normalizedEmail = email.trim().toLowerCase();

    // Cek apakah email sudah pernah punya subscription (trial atau basic)
    const existingUser = await prisma.user.findFirst({
      where: { email: normalizedEmail },
      include: { subscription: true },
    });

    if (existingUser && existingUser.subscription) {
      return res.status(409).json({
        error: 'Email ini sudah pernah menggunakan free trial atau berlangganan. Silakan gunakan email lain atau hubungi admin.',
      });
    }

    // Generate redeem code unik
    let redeemCode = generateRedeemCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.subscription.findUnique({ where: { redeemCode } });
      if (!existing) break;
      redeemCode = generateRedeemCode();
      attempts++;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    // Buat user baru (atau update yang existing tanpa subscription)
    let user;
    if (existingUser) {
      user = existingUser;
    } else {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          name: name?.trim() || normalizedEmail.split('@')[0],
        },
      });
    }

    // Buat subscription trial
    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        packageId: trialPkg.id,
        plan: 'trial',
        redeemCode,
        expiresAt,
      },
    });

    // Kirim email redeem code trial
    try {
      await sendTrialEmail({
        to: normalizedEmail,
        name: name?.trim() || user.name,
        redeemCode,
        expiresAt,
        trialDays,
      });
      logger.info({ email: normalizedEmail, redeemCode, trialDays }, 'Trial email terkirim');
    } catch (err) {
      logger.error({ err, email: normalizedEmail }, 'Gagal kirim trial email');
    }

    logger.info({ userId: user.id, email: normalizedEmail, redeemCode, trialDays }, 'Free trial dibuat');

    return res.status(201).json({
      success: true,
      message: 'Free trial berhasil diaktifkan! Cek email Anda untuk kode aktivasi.',
    });
  } catch (err) {
    logger.error({ err }, 'Gagal membuat free trial');
    return res.status(500).json({ error: 'Gagal memproses free trial. Silakan coba lagi.' });
  }
}

module.exports = { createTrial, getTrialPackage };
