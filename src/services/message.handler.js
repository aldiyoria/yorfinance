const logger = require('../utils/logger');
const { checkAccess, redeemCode, ensureDashboardToken } = require('./subscription.service');
const openaiService = require('./openai.service');
const { appendTransaction, readTransactions, readTransactionsWithIndex, deleteTransaction, updateTransaction, clearAllTransactions } = require('./transaction.service');
const { buildAggregate, buildStructuredSummary, filterTransactionsByDate, buildRecapList } = require('./summary.service');
const { setBudget, checkBudget, deleteBudget } = require('./budget.service');
const { prisma } = require('../db/prisma');
const env = require('../config/env');

// State management untuk edit/delete/reset flow
const userStates = new Map();

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
  '✏️ *Edit & Hapus*\n' +
  '  /hapus — hapus salah satu transaksi\n' +
  '  /edit — edit data transaksi\n' +
  '  /reset — hapus semua data & mulai dari awal\n\n' +
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
  '📊 *Dashboard*\n' +
  '  /dashboard — buka dashboard web dengan grafik\n\n' +
  '⌨️ *Perintah Bot*\n' +
  '  /help — tampilkan bantuan ini\n' +
  '  /perintah — sama dengan /help\n' +
  '  /kategori — lihat daftar kategori\n' +
  '  /contoh — lihat contoh penggunaan\n' +
  '  /status — cek status langganan\n' +
  '  /dashboard — buka dashboard web\n' +
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

  if (s.includes('jt') || s.includes('juta')) {
    const num = parseFloat(s.replace(/[^0-9.,]/g, '').replace(',', '.'));
    return Math.round(num * 1000000);
  }

  if (s.includes('rb') || s.includes('ribu')) {
    const num = parseFloat(s.replace(/[^0-9.,]/g, '').replace(',', '.'));
    return Math.round(num * 1000);
  }

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
  if (text.startsWith('/dashboard')) return '__DASHBOARD__';
  if (text.startsWith('/hapus')) return '__DELETE__';
  if (text.startsWith('/edit')) return '__EDIT__';
  if (text.startsWith('/reset')) return '__RESET__';
  return null;
}

function formatNumberedTxList(txs, label) {
  if (txs.length === 0) {
    return `📋 *${label}*\n\nTidak ada transaksi.`;
  }

  const lines = [`📋 *${label}*\n`];
  for (let i = 0; i < txs.length; i++) {
    const t = txs[i];
    const icon = t.type === 'income' ? '🟢' : '🔴';
    lines.push(`${i + 1}. ${icon} ${t.date} — ${t.item}`);
    lines.push(`   ${formatRupiah(t.amount)} [${t.category}]`);
  }
  lines.push('\nBalas dengan *nomor* transaksi.');
  return lines.join('\n');
}

function parseEditFields(text) {
  const lower = text.toLowerCase().trim();

  const fieldMatch = lower.match(/^(nominal|item|kategori|tanggal|catatan|tipe)\s+(.+)$/i);
  if (!fieldMatch) return null;

  const field = fieldMatch[1].toLowerCase();
  const value = fieldMatch[2].trim();

  switch (field) {
    case 'nominal': {
      const amount = parseNominal(value);
      if (amount > 0) return { amount };
      return null;
    }
    case 'item':
      return { item: value };
    case 'kategori':
      return { category: value };
    case 'tanggal':
      return { date: value };
    case 'catatan':
      return { note: value };
    case 'tipe': {
      if (value.includes('masuk') || value.includes('pemasukan') || value === 'income') return { type: 'income' };
      if (value.includes('keluar') || value.includes('pengeluaran') || value === 'expense') return { type: 'expense' };
      return null;
    }
    default:
      return null;
  }
}

// ===== Delete Flow =====

async function handleDeleteSelect(chatId, text, state) {
  const idx = parseInt(text, 10);
  if (isNaN(idx) || idx < 1 || idx > state.transactions.length) {
    userStates.delete(chatId);
    return '❌ Nomor tidak valid. Ketik /hapus untuk coba lagi.';
  }

  const tx = state.transactions[idx - 1];
  state.selectedTx = tx;
  state.selectedIdx = idx;
  state.action = 'delete_confirm';
  userStates.set(chatId, state);

  const icon = tx.type === 'income' ? '🟢' : '🔴';
  return (
    `Yakin hapus transaksi ini?\n\n` +
    `${icon} *${tx.item}*\n` +
    `• Tanggal: ${tx.date}\n` +
    `• Nominal: ${formatRupiah(tx.amount)}\n` +
    `• Kategori: ${tx.category}\n\n` +
    `Balas *YA* untuk hapus atau *BATAL* untuk batal.`
  );
}

async function handleDeleteConfirm(chatId, text, state) {
  const answer = text.toUpperCase().trim();
  userStates.delete(chatId);

  if (answer === 'YA' || answer === 'Y' || answer === 'YES') {
    await deleteTransaction(state.selectedTx.id);
    return `✅ Transaksi "${state.selectedTx.item}" (${formatRupiah(state.selectedTx.amount)}) berhasil dihapus.`;
  }

  return '❌ Hapus dibatalkan.';
}

// ===== Edit Flow =====

async function handleEditSelect(chatId, text, state) {
  const idx = parseInt(text, 10);
  if (isNaN(idx) || idx < 1 || idx > state.transactions.length) {
    userStates.delete(chatId);
    return '❌ Nomor tidak valid. Ketik /edit untuk coba lagi.';
  }

  const tx = state.transactions[idx - 1];
  state.selectedTx = tx;
  state.selectedIdx = idx;
  state.action = 'edit_field';
  userStates.set(chatId, state);

  return (
    `📝 *Edit Transaksi #${idx}*\n\n` +
    `${tx.type === 'income' ? '🟢' : '🔴'} ${tx.item} — ${formatRupiah(tx.amount)}\n\n` +
    `Field yang bisa diubah:\n` +
    `• *nominal* [jumlah] — contoh: nominal 35000\n` +
    `• *item* [nama] — contoh: item Kopi Susu\n` +
    `• *kategori* [nama] — contoh: kategori Makanan\n` +
    `• *tanggal* [DD-MM-YYYY] — contoh: tanggal 12-07-2026\n` +
    `• *catatan* [teks] — contoh: catatan tambahan\n` +
    `• *tipe* [pemasukan/pengeluaran]\n\n` +
    `Balas dengan field yang ingin diubah.`
  );
}

async function handleEditField(chatId, text, state) {
  const answer = text.trim();

  if (answer.toUpperCase() === 'BATAL' || answer.toUpperCase() === 'CANCEL') {
    userStates.delete(chatId);
    return '❌ Edit dibatalkan.';
  }

  const fields = parseEditFields(answer);
  if (!fields) {
    return (
      '❌ Format tidak dikenali.\n\n' +
      'Contoh:\n' +
      '• nominal 35000\n' +
      '• item Kopi Susu\n' +
      '• kategori Makanan\n' +
      '• tanggal 12-07-2026\n' +
      '• catatan tambahan\n' +
      '• tipe pemasukan\n\n' +
      'Atau ketik *BATAL* untuk batal.'
    );
  }

  await updateTransaction(state.selectedTx.id, fields);
  userStates.delete(chatId);

  const updatedField = Object.entries(fields).map(([k, v]) => `${k}: ${typeof v === 'number' ? formatRupiah(v) : v}`).join(', ');
  return `✅ Transaksi berhasil diubah!\n\n${updatedField}`;
}

// ===== Reset Flow =====

async function handleResetConfirm(chatId, text, state) {
  const answer = text.trim().toUpperCase();
  userStates.delete(chatId);

  if (answer === 'RESET') {
    await clearAllTransactions(state.userId);
    return '✅ Semua data transaksi berhasil dihapus!\n\nMulai catat lagi dari awal.';
  }

  return '❌ Reset dibatalkan. Ketik /reset untuk coba lagi.';
}

async function handleIncomingMessage({ chatId, text, media }) {
  const trimmed = (text || '').trim();

  // Check for active state (edit/delete/reset flow)
  const state = userStates.get(chatId);

  if (state) {
    if (state.action === 'delete_select') return handleDeleteSelect(chatId, trimmed, state);
    if (state.action === 'delete_confirm') return handleDeleteConfirm(chatId, trimmed, state);
    if (state.action === 'edit_select') return handleEditSelect(chatId, trimmed, state);
    if (state.action === 'edit_field') return handleEditField(chatId, trimmed, state);
    if (state.action === 'reset_confirm') return handleResetConfirm(chatId, trimmed, state);
  }

  // /start
  if (trimmed === '/start') {
    const { active, user, needsRedeem } = await checkAccess(chatId);
    if (active) return 'Anda sudah berlangganan! Silakan mulai catat keuangan Anda. 💰\n\nKetik /help untuk lihat semua perintah.';
    if (needsRedeem) return REDEEM_PROMPT_MSG;
    return NOT_SUBSCRIBED_MSG + '\n\nAtau masukkan *redeem code* Anda di bawah ini.';
  }

  // /status
  if (trimmed.startsWith('/status')) {
    const { active, user, needsRedeem } = await checkAccess(chatId);
    if (!user) return NOT_SUBSCRIBED_MSG;
    if (needsRedeem) return 'Status: *Menunggu Redeem*\n\nMasukkan redeem code Anda untuk mengaktifkan.';
    if (!active) return EXPIRED_MSG;

    const sub = user.subscription;
    const expiresAt = new Date(sub.expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    return (
      '📋 *Status Langganan*\n\n' +
      `• Status: *Aktif* ✅\n` +
      `• Paket: ${sub.plan}\n` +
      `• Berlaku hingga: ${expiresAt}`
    );
  }

  // Cek akses user
  const { active, user, needsRedeem } = await checkAccess(chatId);

  if (!user) {
    if (!media && REDEEM_CODE_REGEX.test(trimmed.toUpperCase())) {
      const result = await redeemCode(chatId, trimmed.toUpperCase());
      if (result.success) return result.message + '\n\nKetik /help untuk lihat semua perintah.';
      return result.message + '\n\n' + NOT_SUBSCRIBED_MSG;
    }
    return NOT_SUBSCRIBED_MSG;
  }

  if (needsRedeem) {
    if (media) return REDEEM_PROMPT_MSG;
    const code = trimmed.toUpperCase();
    if (REDEEM_CODE_REGEX.test(code)) {
      const result = await redeemCode(chatId, code);
      if (result.success) return result.message + '\n\nKetik /help untuk lihat semua perintah.';
      return result.message + '\n\n' + REDEEM_PROMPT_MSG;
    }
    return REDEEM_PROMPT_MSG;
  }

  if (!active) return EXPIRED_MSG;

  // /tanggal with arguments
  if (trimmed.startsWith('/tanggal ')) {
    const arg = trimmed.slice(9).trim();

    const rangeMatch = arg.match(/(\d{1,2}-\d{1,2}-\d{4})\s*(?:s\/d|sd|-)\s*(\d{1,2}-\d{1,2}-\d{4})/i);
    if (rangeMatch) {
      const [_, startStr, endStr] = rangeMatch;
      const startParts = startStr.split('-');
      const endParts = endStr.split('-');
      const startDate = new Date(startParts[2], startParts[1] - 1, startParts[0]);
      const endDate = new Date(endParts[2], endParts[1] - 1, endParts[0]);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 'Format tanggal tidak valid. Gunakan format DD-MM-YYYY.';
      const txs = await filterTransactionsByDate({ userId: user.id }, startDate, endDate);
      const sLabel = startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      const eLabel = endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      return buildRecapList(txs, `${sLabel} - ${eLabel}`);
    }

    const singleMatch = arg.match(/(\d{1,2}-\d{1,2}-\d{4})/);
    if (singleMatch) {
      const parts = singleMatch[1].split('-');
      const date = new Date(parts[2], parts[1] - 1, parts[0]);
      if (isNaN(date.getTime())) return 'Format tanggal tidak valid. Gunakan format DD-MM-YYYY.';
      const txs = await filterTransactionsByDate({ userId: user.id }, date, date);
      const label = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      return buildRecapList(txs, label);
    }

    return 'Format: `/tanggal DD-MM-YYYY` atau `/tanggal DD-MM-YYYY s/d DD-MM-YYYY`\n\nContoh:\n• `/tanggal 12-07-2026`\n• `/tanggal 01-07-2026 s/d 12-07-2026`';
  }

  // Help commands
  const helpReply = getHelpReply(trimmed);
  if (helpReply) {
    if (helpReply === '__CHECK_BUDGET__') {
      const txData = await readTransactions({ userId: user.id });
      const result = await checkBudget(user.id, txData);
      return result.message;
    }
    if (helpReply === '__RECAP__') {
      const aggregate = await buildAggregate({ userId: user.id });
      return buildStructuredSummary(aggregate);
    }
    if (helpReply === '__RECAP_HARI__') {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const txs = await filterTransactionsByDate({ userId: user.id }, startOfDay, now);
      const label = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      return buildRecapList(txs, label);
    }
    if (helpReply === '__RECAP_MINGGU__') {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      startOfWeek.setHours(0, 0, 0, 0);
      const txs = await filterTransactionsByDate({ userId: user.id }, startOfWeek, now);
      const startStr = startOfWeek.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      const endStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      return buildRecapList(txs, `${startStr} - ${endStr}`);
    }
    if (helpReply === '__RECAP_BULAN__') {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const txs = await filterTransactionsByDate({ userId: user.id }, startOfMonth, now);
      const label = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      return buildRecapList(txs, label);
    }
    if (helpReply === '__RECAP_TANGGAL__') {
      return 'Format: `/tanggal DD-MM-YYYY` atau `/tanggal DD-MM-YYYY s/d DD-MM-YYYY`\n\nContoh:\n• `/tanggal 12-07-2026` — rekap tanggal 12 Juli 2026\n• `/tanggal 01-07-2026 s/d 12-07-2026` — rekap 1-12 Juli 2026';
    }
    if (helpReply === '__DASHBOARD__') {
      const token = await ensureDashboardToken(user);
      const baseUrl = env.dashboardBaseUrl;
      const url = `${baseUrl}/web/dashboard.html?t=${token}`;
      return `__DASHBOARD_WEBAPP__${url}`;
    }
    if (helpReply === '__DELETE__') {
      const txs = await readTransactionsWithIndex({ userId: user.id });
      const recent = txs.slice(-15).reverse();
      if (recent.length === 0) return '📋 Tidak ada transaksi untuk dihapus.';
      userStates.set(chatId, { action: 'delete_select', transactions: recent, userId: user.id });
      return formatNumberedTxList(recent, 'Pilih Transaksi untuk Dihapus');
    }
    if (helpReply === '__EDIT__') {
      const txs = await readTransactionsWithIndex({ userId: user.id });
      const recent = txs.slice(-15).reverse();
      if (recent.length === 0) return '📋 Tidak ada transaksi untuk diedit.';
      userStates.set(chatId, { action: 'edit_select', transactions: recent, userId: user.id });
      return formatNumberedTxList(recent, 'Pilih Transaksi untuk Diedit');
    }
    if (helpReply === '__RESET__') {
      userStates.set(chatId, { action: 'reset_confirm', userId: user.id });
      return (
        '⚠️ *RESET SEMUA DATA*\n\n' +
        'Semua transaksi Anda akan dihapus permanen dari database.\n' +
        'Tindakan ini *tidak bisa dibatalkan*.\n\n' +
        'Ketik *RESET* untuk konfirmasi atau *BATAL* untuk batal.'
      );
    }
    return helpReply;
  }

  // Handle "set budget" / "hapus budget"
  if (trimmed.toLowerCase().startsWith('set budget ') || trimmed.toLowerCase().startsWith('hapus budget ')) {
    const isDelete = trimmed.toLowerCase().startsWith('hapus budget ');
    const rest = trimmed.slice(isDelete ? 13 : 11).trim();

    if (isDelete) {
      const result = await deleteBudget(user.id, rest);
      return result.message;
    }

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

  // "link" → informasi transaksi tersimpan di DB
  if (trimmed.toLowerCase() === 'link') {
    return '📊 *Data Transaksi*\n\nSemua transaksi Anda tersimpan di database dan bisa diakses melalui *dashboard*.\n\nKetik /dashboard untuk melihat grafik dan analisis keuangan.';
  }

  // Proses transaksi via foto
  if (media) {
    const tx = await openaiService.extractTransactionFromImage(media.base64, media.mimeType, trimmed || '');
    await appendTransaction({ userId: user.id }, tx);
    return formatTxReply(tx);
  }

  if (!trimmed) return HELP_MSG;

  const intent = await openaiService.detectIntent(trimmed);
  logger.info({ chatId, intent }, 'Intent terdeteksi');

  if (intent === 'add_transaction') {
    const tx = await openaiService.extractTransactionFromText(trimmed);
    await appendTransaction({ userId: user.id }, tx);
    return formatTxReply(tx);
  }

  if (intent === 'summary_query') {
    const aggregate = await buildAggregate({ userId: user.id });
    return openaiService.answerSummary(trimmed, aggregate);
  }

  if (intent === 'recap') {
    const aggregate = await buildAggregate({ userId: user.id });
    return buildStructuredSummary(aggregate);
  }

  if (intent === 'set_budget') {
    const rest = trimmed.replace(/^(set\s+)?budget\s+/i, '').trim();
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
    const txData = await readTransactions({ userId: user.id });
    const result = await checkBudget(user.id, txData);
    return result.message;
  }

  return HELP_MSG;
}

module.exports = { handleIncomingMessage };
