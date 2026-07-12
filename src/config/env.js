require('dotenv').config();

/**
 * Memusatkan pembacaan environment variable + validasi.
 * Semua modul lain mengimpor `env` dari sini, bukan process.env langsung.
 */
function required(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable "${key}" wajib diisi. Cek file .env Anda.`);
  }
  return value;
}

const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  adminApiKey: required('ADMIN_API_KEY'),

  databaseUrl: required('DATABASE_URL'),

  telegram: {
    botToken: required('TELEGRAM_BOT_TOKEN'),
  },

  openai: {
    apiKey: required('OPENAI_API_KEY'),
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    baseUrl: process.env.OPENAI_BASE_URL || null,
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'YorFinance <noreply@yorfinance.com>',
  },

  google: {
    spreadsheetId: required('GOOGLE_SPREADSHEET_ID'),
  },

  doku: {
    clientId: process.env.DOKU_CLIENT_ID || '',
    secretKey: process.env.DOKU_SECRET_KEY || '',
    apiUrl: process.env.DOKU_API_URL || 'https://api-sandbox.doku.com',
    callbackUrl: process.env.DOKU_CALLBACK_URL || 'http://localhost:3000/api/payments/callback',
  },

  dashboardBaseUrl: process.env.DASHBOARD_BASE_URL || 'http://localhost:3000',

  tz: process.env.TZ || 'Asia/Jakarta',
};

module.exports = env;
