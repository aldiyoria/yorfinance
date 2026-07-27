require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const crypto = require('crypto');

const nodemailer = require('nodemailer');

function generateRedeemCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function main() {
  const smtp = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const paidPayments = await prisma.payment.findMany({
    where: { status: 'PAID' },
    include: { user: true },
  });

  console.log(`Ditemukan ${paidPayments.length} payment PAID`);

  for (const payment of paidPayments) {
    if (!payment.user) {
      console.log(`SKIP: Payment ${payment.externalId} — user tidak ditemukan`);
      continue;
    }

    const existingSub = await prisma.subscription.findFirst({
      where: { userId: payment.user.id },
    });

    if (existingSub) {
      console.log(`OK: ${payment.user.email} — subscription sudah ada (${existingSub.redeemCode})`);
      continue;
    }

    const descMatch = payment.description?.match(/^YorFinance (\w+) —/);
    const planSlug = descMatch ? descMatch[1] : 'basic';
    const durationDays = 30;

    let redeemCode = generateRedeemCode();
    let attempts = 0;
    while (attempts < 10) {
      const exists = await prisma.subscription.findUnique({ where: { redeemCode } });
      if (!exists) break;
      redeemCode = generateRedeemCode();
      attempts++;
    }

    const now = new Date();
    await prisma.subscription.create({
      data: {
        userId: payment.user.id,
        plan: planSlug,
        redeemCode,
        status: 'PENDING',
        expiresAt: new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000),
      },
    });

    console.log(`CREATED: ${payment.user.email} — subscription dibuat, redeemCode: ${redeemCode}`);

    try {
      const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'YorFinanceBot';
      await smtp.sendMail({
        from: process.env.SMTP_FROM || `YorFinance <${process.env.SMTP_USER}>`,
        to: payment.user.email,
        subject: 'YorFinance - Kode Aktivasi Anda',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
            <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;border-radius:10px 10px 0 0;text-align:center;">
              <h1 style="color:white;margin:0;font-size:24px;">YorFinance</h1>
            </div>
            <div style="background:#f9fafb;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;">
              <p>Halo <strong>${payment.user.name || 'User'}</strong>,</p>
              <p>Terima kasih telah berlangganan <strong>YorFinance</strong>!</p>
              <p>Berikut adalah kode aktivasi Anda:</p>
              <div style="background:white;border:2px dashed #667eea;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
                <p style="margin:0 0 5px;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Kode Aktivasi</p>
                <p style="font-size:32px;font-weight:bold;margin:0;letter-spacing:5px;font-family:monospace;">${redeemCode}</p>
              </div>
              <div style="background:white;border-radius:8px;padding:20px;margin:20px 0;">
                <p><strong>Cara Menggunakan:</strong></p>
                <ol style="margin:0;padding-left:20px;">
                  <li style="margin-bottom:8px;">Buka Telegram, cari <strong>@${botUsername}</strong></li>
                  <li style="margin-bottom:8px;">Kirim <code>/start</code></li>
                  <li style="margin-bottom:8px;">Masukkan kode aktivasi di atas</li>
                </ol>
              </div>
              <p style="font-size:12px;color:#9ca3af;text-align:center;">Email ini dikirim otomatis oleh YorFinance.</p>
            </div>
          </div>
        `,
      });
      console.log(`EMAIL SENT: ${payment.user.email}`);
    } catch (err) {
      console.error(`EMAIL FAILED: ${payment.user.email} — ${err.message}`);
    }
  }

  await prisma.$disconnect();
  console.log('Selesai.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
