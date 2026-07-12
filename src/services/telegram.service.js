const { TelegramBot } = require('node-telegram-bot-api');
const logger = require('../utils/logger');
const { handleIncomingMessage } = require('./message.handler');

let bot = null;

async function withRetry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isTransient = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message?.includes('fetch failed');
      if (isTransient && attempt < maxRetries) {
        const delay = 1000 * attempt;
        logger.warn({ attempt, delay, code: err.code }, 'Transient network error, retrying...');
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

async function safeReply(chatId, text) {
  try {
    await withRetry(() => bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }));
  } catch (err) {
    logger.error({ err, chatId }, 'Gagal kirim reply');
    try {
      await withRetry(() => bot.sendMessage(chatId, 'Terjadi kesalahan. Coba lagi sebentar.'));
    } catch (_) {}
  }
}

function initTelegram() {
  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

  bot.on('polling_error', (err) => {
    logger.error({ err }, 'Telegram polling error');
  });

  // Set bot menu commands (muncul di tombol / di sebelah chat)
  bot.setMyCommands([
    { command: 'start', description: 'Mulai bot & masukkan redeem code' },
    { command: 'help', description: 'Bantuan cara pakai bot' },
    { command: 'perintah', description: 'Daftar semua perintah' },
    { command: 'kategori', description: 'Lihat daftar kategori transaksi' },
    { command: 'contoh', description: 'Contoh cara pakai bot' },
    { command: 'status', description: 'Cek status langganan' },
    { command: 'rekap', description: 'Rekap keuangan bulanan (summary)' },
    { command: 'hari', description: 'Rekap transaksi hari ini' },
    { command: 'minggu', description: 'Rekap transaksi minggu ini' },
    { command: 'bulan', description: 'Rekap transaksi bulan ini (list)' },
    { command: 'tanggal', description: 'Rekap transaksi tanggal tertentu' },
    { command: 'budget', description: 'Atur & cek budget per kategori' },
  ]).then(() => {
    logger.info('Bot menu commands registered');
  }).catch((err) => {
    logger.error({ err }, 'Failed to register bot menu commands');
  });

  // /start
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== 'private') return;
    try {
      const reply = await handleIncomingMessage({ chatId, text: '/start', media: null });
      await safeReply(chatId, reply);
    } catch (err) {
      logger.error({ err, chatId }, 'Error handling /start');
      await safeReply(chatId, 'Terjadi kesalahan. Coba lagi sebentar.');
    }
  });

  // /help, /perintah, /kategori, /contoh
  bot.onText(/\/(help|perintah|kategori|contoh)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== 'private') return;
    try {
      const reply = await handleIncomingMessage({ chatId, text: match[0], media: null });
      await safeReply(chatId, reply);
    } catch (err) {
      logger.error({ err, chatId }, 'Error handling command');
      await safeReply(chatId, 'Terjadi kesalahan. Coba lagi sebentar.');
    }
  });

  // /status
  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== 'private') return;
    try {
      const reply = await handleIncomingMessage({ chatId, text: '/status', media: null });
      await safeReply(chatId, reply);
    } catch (err) {
      logger.error({ err, chatId }, 'Error handling /status');
      await safeReply(chatId, 'Terjadi kesalahan. Coba lagi sebentar.');
    }
  });

  // /budget
  bot.onText(/\/budget/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== 'private') return;
    try {
      const reply = await handleIncomingMessage({ chatId, text: '/budget', media: null });
      await safeReply(chatId, reply);
    } catch (err) {
      logger.error({ err, chatId }, 'Error handling /budget');
      await safeReply(chatId, 'Terjadi kesalahan. Coba lagi sebentar.');
    }
  });

  // /rekap
  bot.onText(/\/rekap/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== 'private') return;
    try {
      const reply = await handleIncomingMessage({ chatId, text: '/rekap', media: null });
      await safeReply(chatId, reply);
    } catch (err) {
      logger.error({ err, chatId }, 'Error handling /rekap');
      await safeReply(chatId, 'Terjadi kesalahan. Coba lagi sebentar.');
    }
  });

  // /hari — rekap hari ini
  bot.onText(/\/hari/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== 'private') return;
    try {
      const reply = await handleIncomingMessage({ chatId, text: '/hari', media: null });
      await safeReply(chatId, reply);
    } catch (err) {
      logger.error({ err, chatId }, 'Error handling /hari');
      await safeReply(chatId, 'Terjadi kesalahan. Coba lagi sebentar.');
    }
  });

  // /minggu — rekap minggu ini
  bot.onText(/\/minggu/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== 'private') return;
    try {
      const reply = await handleIncomingMessage({ chatId, text: '/minggu', media: null });
      await safeReply(chatId, reply);
    } catch (err) {
      logger.error({ err, chatId }, 'Error handling /minggu');
      await safeReply(chatId, 'Terjadi kesalahan. Coba lagi sebentar.');
    }
  });

  // /bulan — rekap bulan ini (list)
  bot.onText(/\/bulan/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== 'private') return;
    try {
      const reply = await handleIncomingMessage({ chatId, text: '/bulan', media: null });
      await safeReply(chatId, reply);
    } catch (err) {
      logger.error({ err, chatId }, 'Error handling /bulan');
      await safeReply(chatId, 'Terjadi kesalahan. Coba lagi sebentar.');
    }
  });

  // /tanggal — rekap tanggal tertentu
  bot.onText(/\/tanggal/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== 'private') return;
    try {
      const reply = await handleIncomingMessage({ chatId, text: msg.text, media: null });
      await safeReply(chatId, reply);
    } catch (err) {
      logger.error({ err, chatId }, 'Error handling /tanggal');
      await safeReply(chatId, 'Terjadi kesalahan. Coba lagi sebentar.');
    }
  });

  // Semua pesan lain (teks + foto)
  bot.on('message', async (msg) => {
    if (msg.chat.type !== 'private') return;
    if (msg.text && msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;

    try {
      let media = null;

      if (msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        const file = await withRetry(() => bot.getFile(photo.file_id));
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

        const response = await withRetry(() => fetch(fileUrl));
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        media = {
          base64,
          mimeType: photo.mime_type || 'image/jpeg',
        };
      }

      const text = msg.caption || msg.text || '';
      const reply = await handleIncomingMessage({ chatId, text, media });
      await safeReply(chatId, reply);
    } catch (err) {
      logger.error({ err, chatId }, 'Gagal memproses pesan Telegram');
      await safeReply(chatId, 'Maaf, terjadi kesalahan saat memproses pesan Anda. Coba lagi sebentar ya. 🙏');
    }
  });

  logger.info('Telegram bot started (polling)');
  return bot;
}

function getBot() {
  return bot;
}

module.exports = { initTelegram, getBot };
