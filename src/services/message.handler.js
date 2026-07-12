const logger = require('../utils/logger');
const { checkAccess, redeemCode } = require('./subscription.service');
const openaiService = require('./openai.service');
const { appendTransaction, createUserSheet, readTransactions } = require('./sheets.service');
const { buildAggregate, buildStructuredSummary, filterTransactionsByDate, buildRecapList } = require('./summary.service');
const { setBudget, checkBudget, deleteBudget } = require('./budget.service');
const { prisma } = require('../db/prisma');

const NOT_SUBSCRIBED_MSG =
  'Hi! Selamat datang di *YorFinance* 🎉\n\n' +
  'Anda belum terdaftar. Silakan hubungi admin untuk berlangganan.\n' +
  'Setelah berlangganan, masukkan *redeem code* Anda untuk mulai.';

const HELP_MSG =
  '📖 *Daftar Perintah YorFinance*\n\n' +
  '💰 *Catat Transaksi*\n' +
  'Kirim pesan teks biasa, contoh:\n' +
  '  • beli kopi 25rb\n' +
  '  • gaji masuk 5jt\n' +
  '  • bayar listrik 300rb\n' +
  '  • jual barang 500rb\n\n' +
  '📸 *Foto Struk*\n' +
  'Kirim foto struk/nota → otomatis dicatat.\n' +
  'Bisa tambahkan caption untuk catatan tambahan.\n\n' +
  '📊 *Rekap & Ringkasan*\n' +
  '  /rekap — rekap keuangan bulanan (summary)\n' +
  '  /hari — rekap transaksi hari ini (list)\n' +
  '  /minggu — rekap transaksi minggu ini (list)\n' +
  '  /bulan — rekap transaksi bulan ini (list)\n' +
  '  /tanggal DD-MM-YYYY — rekap tanggal tertentu\n' +
  '  /tanggal DD-MM-YYYY s/d DD-MM-YYYY — rekap rentang tanggal\n\n' +
  '💵 *Budget*\n' +
  '  /budget — cek sisa budget per kategori\n' +
  '  • set budget makanan 800000\n' +
  '  • hapus budget hiburan\n\n' +
  '⌨️ *Perintah Bot*\n' +
  '  /help — tampilkan bantuan ini\n' +
  '  /perintah — sama dengan /help\n' +
  '  /kategori — lihat daftar kategori\n' +
  '  /contoh — lihat contoh penggunaan\n' +
  '  /status — cek status langganan\n' +
  '  /start — mulai dari awal';

const CATEGORY_MSG =
  '📂 *Daftar Kategori Transaksi*\n\n' +
  '• Makanan & Minuman\n' +
  '• Transportasi\n' +
  '• Belanja\n' +
  '• Tagihan & Utilitas\n' +
  '• Kesehatan\n' +
  '• Hiburan\n' +
  '• Pendidikan\n' +
  '• Gaji\n' +
  '• Investasi\n' +
  '• Lainnya\n\n' +
  'Kategori akan ditentukan otomatis oleh bot berdasarkan transaksi Anda.';

const EXAMPLE_MSG =
  '💡 *Contoh Penggunaan*\n\n' +
  '✏️ *Catat Pengeluaran:*\n' +
  '  • beli kopi 25rb\n' +
  '  • makan siang 35rb\n' +
  '  • bensin 100rb\n' +
  '  • beli buku 80rb\n\n' +
  '✏️ *Catat Pemasukan:*\n' +
  '  • gaji masuk 5jt\n' +
  '  • jual hp 2jt\n' +
  '  • bonus 1jt\n\n' +
  '📸 *Foto Struk:*\n' +
  '  Kirim foto struk → otomatis tercatat.\n' +
  '  Tambah caption "makan siang" untuk catatan.\n\n' +
  '📊 *Lihat Rekap:*\n' +
  '  /hari — rekap hari ini\n' +
  '  /minggu — rekap minggu ini\n' +
  '  /bulan — rekap bulan ini\n' +
  '  /tanggal 12-07-2026 — rekap tanggal tertentu\n' +
  '  /rekap — rekap bulanan (summary)\n\n' +
  '💵 *Budget:*\n' +
  '  /budget — cek budget\n' +
  '  • set budget makanan 800rb';

const REDEEM_PROMPT_MSG =
  'Masukkan *redeem code* Anda (6 karakter):';

const EXPIRED_MSG =
  'Masa aktif langganan Anda sudah habis.\n' +
  'Silakan hubungi admin untuk perpanjang.';

function formatRupiah(n) {
  return 'Rp' + Number(n || 0).toLocaleString('id-ID');
}

/**
 * Parse nominal dari string seperti "800rb", "1.5jt", "250000", "800.000"
 */
function parseNominal(str) {
  const s = str.toLowerCase().replace(/[^0-9.,jt rb]/g, '').trim();
  if (!s) return 0;

  // Handle "jt" / "juta"
  if (s.includes('jt') || s.includes('juta')) {
    const num = parseFloat(s.replace(/[^0-9.,]/g, '').replace(',', '.'));
    return Math.round(num * 1000000);
  }

  // Handle "rb" / "ribu"
  if (s.includes('rb') || s.includes('ribu')) {
    const num = parseFloat(s.replace(/[^0-9.,]/g, '').replace(',', '.'));
    return Math.round(num * 1000);
  }

  // Handle "jt" / "juta" patterns
  if (s.includes('jt') || s.includes('juta')) {
    const num = parseFloat(s.replace(/[^0-9.,]/g, '').replace(',', '.'));
    return Math.round(num * 1000000);
  }

  // Plain number — handle "800.000" or "800,000" or "800000"
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num);
}

function formatTxReply(tx) {
  const label = tx.type === 'income' ? 'Pemasukan' : 'Pengeluaran';
  return (
    `✅ Tercatat!\n\n` +
    `• Tipe: ${label}\n` +
    `• Nominal: ${formatRupiah(tx.amount)}\n` +
    `• Kategori: ${tx.category}\n` +
    `• Item: ${tx.item}\n` +
    `• Tanggal: ${tx.date}`
  );
}

const REDEEM_CODE_REGEX = /^[A-Z0-9]{6}$/;

/**
 * Pastikan user punya sheet di spreadsheet master. Jika belum, buat baru.
 * @returns {Promise<string>} sheetName
 */
async function ensureSheet(user) {
  if (user.sheetName) return user.sheetName;

  const userName = user.name || user.email.split('@')[0];
  const { sheetId, sheetName } = await createUserSheet({ userName });
  await prisma.user.update({
    where: { id: user.id },
    data: { sheetId, sheetName },
  });
  user.sheetId = sheetId;
  user.sheetName = sheetName;
  return sheetName;
}

function getHelpReply(text) {
  if (text.startsWith('/help') || text.startsWith('/perintah')) return HELP_MSG;
  if (text.startsWith('/kategori')) return CATEGORY_MSG;
  if (text.startsWith('/contoh')) return EXAMPLE_MSG;
  if (text.startsWith('/budget')) return '__CHECK_BUDGET__';
  if (text.startsWith('/rekap')) return '__RECAP__';
  if (text.startsWith('/hari')) return '__RECAP_HARI__';
  if (text.startsWith('/minggu')) return '__RECAP_MINGGU__';
  if (text.startsWith('/bulan')) return '__RECAP_BULAN__';
  if (text.startsWith('/tanggal')) return '__RECAP_TANGGAL__';
  return null;
}

/**
 * Inti pemrosesan pesan (provider-agnostic).
 * @param {object} input
 * @param {number|string} input.chatId - Telegram chat ID
 * @param {string} input.text - isi teks (caption bila media)
 * @param {{ base64: string, mimeType: string }|null} [input.media] - media gambar bila ada.
 * @returns {Promise<string>} teks balasan.
 */
async function handleIncomingMessage({ chatId, text, media }) {
  const trimmed = (text || '').trim();

  // /start → sapa + minta redeem code
  if (trimmed === '/start') {
    const { active, user, needsRedeem } = await checkAccess(chatId);
    if (active) {
      return 'Anda sudah berlangganan! Silakan mulai catat keuangan Anda. 💰\n\nKetik /help untuk lihat semua perintah.';
    }
    if (needsRedeem) {
      return REDEEM_PROMPT_MSG;
    }
    return NOT_SUBSCRIBED_MSG + '\n\nAtau masukkan *redeem code* Anda di bawah ini.';
  }

  // /status → cek status langganan
  if (trimmed.startsWith('/status')) {
    const { active, user, needsRedeem } = await checkAccess(chatId);
    if (!user) return NOT_SUBSCRIBED_MSG;
    if (needsRedeem) return 'Status: *Menunggu Redeem*\n\nMasukkan redeem code Anda untuk mengaktifkan.';
    if (!active) return EXPIRED_MSG;

    const sub = user.subscription;
    const expiresAt = new Date(sub.expiresAt).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    return (
      '📋 *Status Langganan*\n\n' +
      `• Status: *Aktif* ✅\n` +
      `• Paket: ${sub.plan}\n` +
      `• Berlaku hingga: ${expiresAt}`
    );
  }

  // Cek akses user
  const { active, user, needsRedeem } = await checkAccess(chatId);

  // Belum punya subscription — coba cek apakah ini kode redeem
  if (!user) {
    if (!media && REDEEM_CODE_REGEX.test(trimmed.toUpperCase())) {
      const result = await redeemCode(chatId, trimmed.toUpperCase());
      if (result.success) {
        return result.message + '\n\nKetik /help untuk lihat semua perintah.';
      }
      return result.message + '\n\n' + NOT_SUBSCRIBED_MSG;
    }
    return NOT_SUBSCRIBED_MSG;
  }

  // Punya subscription tapi belum redeem
  if (needsRedeem) {
    if (media) return REDEEM_PROMPT_MSG;

    const code = trimmed.toUpperCase();
    if (REDEEM_CODE_REGEX.test(code)) {
      const result = await redeemCode(chatId, code);
      if (result.success) {
        return result.message + '\n\nKetik /help untuk lihat semua perintah.';
      }
      return result.message + '\n\n' + REDEEM_PROMPT_MSG;
    }
    return REDEEM_PROMPT_MSG;
  }

  // Subscription expired
  if (!active) {
    return EXPIRED_MSG;
  }

  // /tanggal with arguments — parse date range BEFORE helpReply check
  if (trimmed.startsWith('/tanggal ')) {
    const sheetName = await ensureSheet(user);
    const arg = trimmed.slice(9).trim();

    // Parse "DD-MM-YYYY s/d DD-MM-YYYY" or "DD-MM-YYYY sd DD-MM-YYYY"
    const rangeMatch = arg.match(/(\d{1,2}-\d{1,2}-\d{4})\s*(?:s\/d|sd|-)\s*(\d{1,2}-\d{1,2}-\d{4})/i);
    if (rangeMatch) {
      const [_, startStr, endStr] = rangeMatch;
      const startParts = startStr.split('-');
      const endParts = endStr.split('-');
      const startDate = new Date(startParts[2], startParts[1] - 1, startParts[0]);
      const endDate = new Date(endParts[2], endParts[1] - 1, endParts[0]);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return 'Format tanggal tidak valid. Gunakan format DD-MM-YYYY.';
      }

      const txs = await filterTransactionsByDate({ sheetName }, startDate, endDate);
      const sLabel = startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      const eLabel = endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      return buildRecapList(txs, `${sLabel} - ${eLabel}`);
    }

    // Single date: "DD-MM-YYYY"
    const singleMatch = arg.match(/(\d{1,2}-\d{1,2}-\d{4})/);
    if (singleMatch) {
      const parts = singleMatch[1].split('-');
      const date = new Date(parts[2], parts[1] - 1, parts[0]);
      if (isNaN(date.getTime())) {
        return 'Format tanggal tidak valid. Gunakan format DD-MM-YYYY.';
      }
      const txs = await filterTransactionsByDate({ sheetName }, date, date);
      const label = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      return buildRecapList(txs, label);
    }

    return 'Format: `/tanggal DD-MM-YYYY` atau `/tanggal DD-MM-YYYY s/d DD-MM-YYYY`\n\nContoh:\n• `/tanggal 12-07-2026`\n• `/tanggal 01-07-2026 s/d 12-07-2026`';
  }

  // Help commands
  const helpReply = getHelpReply(trimmed);
  if (helpReply) {
    if (helpReply === '__CHECK_BUDGET__') {
      // /budget command — cek sisa budget
      const sheetName = await ensureSheet(user);
      const txData = await readTransactions({ sheetName });
      const result = await checkBudget(user.id, txData);
      return result.message;
    }
    if (helpReply === '__RECAP__') {
      // /rekap command — rekap keuangan bulanan
      const sheetName = await ensureSheet(user);
      const aggregate = await buildAggregate({ sheetName });
      return buildStructuredSummary(aggregate);
    }
    if (helpReply === '__RECAP_HARI__') {
      const sheetName = await ensureSheet(user);
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const txs = await filterTransactionsByDate({ sheetName }, startOfDay, now);
      const label = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      return buildRecapList(txs, label);
    }
    if (helpReply === '__RECAP_MINGGU__') {
      const sheetName = await ensureSheet(user);
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      startOfWeek.setHours(0, 0, 0, 0);
      const txs = await filterTransactionsByDate({ sheetName }, startOfWeek, now);
      const startStr = startOfWeek.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      const endStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      return buildRecapList(txs, `${startStr} - ${endStr}`);
    }
    if (helpReply === '__RECAP_BULAN__') {
      const sheetName = await ensureSheet(user);
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const txs = await filterTransactionsByDate({ sheetName }, startOfMonth, now);
      const label = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      return buildRecapList(txs, label);
    }
    if (helpReply === '__RECAP_TANGGAL__') {
      return 'Format: `/tanggal DD-MM-YYYY` atau `/tanggal DD-MM-YYYY s/d DD-MM-YYYY`\n\nContoh:\n• `/tanggal 12-07-2026` — rekap tanggal 12 Juli 2026\n• `/tanggal 01-07-2026 s/d 12-07-2026` — rekap 1-12 Juli 2026';
    }
    return helpReply;
  }

  // Handle "set budget [kategori] [nominal]" — bisa juga via natural language
  if (trimmed.toLowerCase().startsWith('set budget ') || trimmed.toLowerCase().startsWith('hapus budget ')) {
    const isDelete = trimmed.toLowerCase().startsWith('hapus budget ');
    const rest = trimmed.slice(isDelete ? 13 : 11).trim();

    if (isDelete) {
      const result = await deleteBudget(user.id, rest);
      return result.message;
    }

    // Parse "kategori nominal" — contoh: "makanan 800rb" atau "makanan 800000"
    const parts = rest.split(/\s+/);
    if (parts.length >= 2) {
      const category = parts[0];
      const amountStr = parts.slice(1).join('');
      const amount = parseNominal(amountStr);
      if (amount > 0) {
        const result = await setBudget(user.id, category, amount);
        return result.message;
      }
    }
    return 'Format: `set budget [kategori] [nominal]`\nContoh: `set budget makanan 800000`';
  }

  // "link" → return spreadsheet URL
  if (trimmed.toLowerCase() === 'link') {
    if (user.sheetName) {
      const url = `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SPREADSHEET_ID}/edit#gid=${user.sheetId}`;
      return (
        `📊 *Link Spreadsheet Anda:*\n\n` +
        `${url}\n\n` +
        `Sheet: *${user.sheetName}*\n` +
        `📝 Spreadsheet ini *view-only* — semua pencatatan dilakukan melalui bot ini.`
      );
    }
    return 'Link spreadsheet belum tersedia. Silakan hubungi admin.';
  }

  // Aktif — proses normal
  if (media) {
    const sheetName = await ensureSheet(user);
    const tx = await openaiService.extractTransactionFromImage(
      media.base64,
      media.mimeType,
      trimmed || ''
    );
    await appendTransaction({ sheetName }, tx);
    return formatTxReply(tx);
  }

  if (!trimmed) return HELP_MSG;

  const intent = await openaiService.detectIntent(trimmed);
  logger.info({ chatId, intent }, 'Intent terdeteksi');

  if (intent === 'add_transaction') {
    const sheetName = await ensureSheet(user);
    const tx = await openaiService.extractTransactionFromText(trimmed);
    await appendTransaction({ sheetName }, tx);
    return formatTxReply(tx);
  }

  if (intent === 'summary_query') {
    const sheetName = await ensureSheet(user);
    const aggregate = await buildAggregate({ sheetName });
    return openaiService.answerSummary(trimmed, aggregate);
  }

  if (intent === 'recap') {
    const sheetName = await ensureSheet(user);
    const aggregate = await buildAggregate({ sheetName });
    return buildStructuredSummary(aggregate);
  }

  if (intent === 'set_budget') {
    // Contoh: "budget makanan 800rb", "set budget transportasi 500000"
    const rest = trimmed
      .replace(/^(set\s+)?budget\s+/i, '')
      .trim();
    const parts = rest.split(/\s+/);
    if (parts.length >= 2) {
      const category = parts[0];
      const amount = parseNominal(parts.slice(1).join(''));
      if (amount > 0) {
        const result = await setBudget(user.id, category, amount);
        return result.message;
      }
    }
    return 'Format: `set budget [kategori] [nominal]`\nContoh: `set budget makanan 800000`';
  }

  if (intent === 'check_budget') {
    const sheetName = await ensureSheet(user);
    const txData = await readTransactions({ sheetName });
    const result = await checkBudget(user.id, txData);
    return result.message;
  }

  return HELP_MSG;
}

module.exports = { handleIncomingMessage };
