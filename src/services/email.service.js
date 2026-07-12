const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.port === 465,
  auth: {
    user: env.smtp.user,
    pass: env.smtp.pass,
  },
});

/**
 * Kirim email redeem code ke user.
 * @param {object} opts
 * @param {string} opts.to - email tujuan
 * @param {string} [opts.name] - nama user
 * @param {string} opts.redeemCode - kode redeem 6 karakter
 * @param {string} [opts.plan] - paket langganan
 */
async function sendRedeemEmail({ to, name, redeemCode, plan = 'basic' }) {
  const subject = 'YorFinance - Kode Aktivasi Anda';

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">YorFinance</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0;">Pencatat Keuangan Pribadi</p>
      </div>
      
      <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="color: #374151; font-size: 16px;">Halo <strong>${name || 'User'}</strong>,</p>
        
        <p style="color: #374151;">Terima kasih telah berlangganan <strong>YorFinance</strong>!</p>
        
        <p style="color: #374151;">Berikut adalah kode aktivasi Anda:</p>
        
        <div style="background: white; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
          <p style="color: #6b7280; margin: 0 0 5px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Kode Aktivasi</p>
          <p style="color: #1f2937; font-size: 32px; font-weight: bold; margin: 0; letter-spacing: 5px; font-family: monospace;">${redeemCode}</p>
        </div>
        
        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="color: #374151; margin: 0 0 10px;"><strong>Cara Menggunakan:</strong></p>
          <ol style="color: #374151; margin: 0; padding-left: 20px;">
            <li style="margin-bottom: 8px;">Buka Telegram, cari <strong>@YorFinanceBot</strong></li>
            <li style="margin-bottom: 8px;">Kirim <code>/start</code></li>
            <li style="margin-bottom: 8px;">Masukkan kode aktivasi di atas</li>
          </ol>
          <p style="color: #374151; margin: 10px 0 0;">Setelah aktivasi, Anda bisa langsung mulai mencatat keuangan!</p>
        </div>
        
        <div style="background: #ecfdf5; border-radius: 8px; padding: 15px; margin: 20px 0;">
          <p style="color: #065f46; margin: 0; font-size: 14px;">
            <strong>Paket:</strong> ${plan.charAt(0).toUpperCase() + plan.slice(1)}<br>
          </p>
        </div>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
          Email ini dikirim otomatis oleh YorFinance.<br>
          Jika Anda tidak merasa berlangganan, abaikan email ini.
        </p>
      </div>
    </div>
  `;

  const textBody = `
YorFinance - Kode Aktivasi Anda

Halo ${name || 'User'},

Terima kasih telah berlangganan YorFinance!

Kode aktivasi Anda: ${redeemCode}

Cara Menggunakan:
1. Buka Telegram, cari @YorFinanceBot
2. Kirim /start
3. Masukkan kode aktivasi di atas

Paket: ${plan}

---
Email ini dikirim otomatis oleh YorFinance.
Jika Anda tidak merasa berlangganan, abaikan email ini.
  `.trim();

  try {
    const info = await transporter.sendMail({
      from: env.smtp.from,
      to,
      subject,
      text: textBody,
      html: htmlBody,
    });

    logger.info({ to, messageId: info.messageId }, 'Email redeem code terkirim');
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error({ err, to }, 'Gagal mengirim email redeem code');
    return { success: false, error: err.message };
  }
}

/**
 * Verifikasi koneksi SMTP.
 */
async function verifyConnection() {
  try {
    await transporter.verify();
    logger.info('SMTP connection verified');
    return true;
  } catch (err) {
    logger.error({ err }, 'SMTP connection failed');
    return false;
  }
}

module.exports = { sendRedeemEmail, verifyConnection };
