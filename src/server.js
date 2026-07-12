const env = require('./config/env');
const app = require('./app');
const logger = require('./utils/logger');
const { connectDb, disconnectDb } = require('./db/prisma');
const { initTelegram } = require('./services/telegram.service');
const { verifyConnection: verifySmtp } = require('./services/email.service');

async function bootstrap() {
  await connectDb();

  // Verifikasi koneksi SMTP
  await verifySmtp();

  // Jalankan HTTP server (untuk endpoint subscription/webhook).
  const server = app.listen(env.port, () => {
    logger.info(`HTTP server berjalan di http://localhost:${env.port}`);
  });

  // Inisialisasi Telegram bot (polling).
  initTelegram();

  // Graceful shutdown.
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Mematikan aplikasi...');
    server.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Gagal memulai aplikasi');
  process.exit(1);
});
