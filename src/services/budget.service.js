const { prisma } = require('../db/prisma');
const { CATEGORIES } = require('../prompts/financePrompts');
const logger = require('../utils/logger');

/**
 * Get current month in "YYYY-MM" format (Asia/Jakarta).
 */
function getCurrentMonth() {
  const now = new Date();
  const offset = 7 * 60 * 60 * 1000; // UTC+7
  const local = new Date(now.getTime() + offset);
  return local.toISOString().slice(0, 7);
}

/**
 * Match input kategori ke kategori yang valid (fuzzy/partial).
 * "makanan" → "Makanan & Minuman", "transport" → "Transportasi", dll.
 */
function matchCategory(input) {
  const lower = input.toLowerCase().trim();

  // Exact match dulu
  const exact = CATEGORIES.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;

  // Partial/contains match
  const partial = CATEGORIES.find((c) => c.toLowerCase().includes(lower));
  if (partial) return partial;

  // Reverse partial — input contains category keyword
  const reverse = CATEGORIES.find((c) => {
    const words = c.toLowerCase().split(/\s+/);
    return words.some((w) => w.length > 3 && lower.includes(w));
  });
  if (reverse) return reverse;

  // Keyword mapping untuk common abbreviations
  const keywordMap = {
    'makan': 'Makanan & Minuman',
    'makanan': 'Makanan & Minuman',
    'minum': 'Makanan & Minuman',
    'food': 'Makanan & Minuman',
    'transport': 'Transportasi',
    'transportasi': 'Transportasi',
    'bensin': 'Transportasi',
    'ojol': 'Transportasi',
    'grab': 'Transportasi',
    'gojek': 'Transportasi',
    'belanja': 'Belanja',
    'shopping': 'Belanja',
    'tagihan': 'Tagihan & Utilitas',
    'listrik': 'Tagihan & Utilitas',
    'air': 'Tagihan & Utilitas',
    'internet': 'Tagihan & Utilitas',
    'pulsa': 'Tagihan & Utilitas',
    'utilitas': 'Tagihan & Utilitas',
    'kesehatan': 'Kesehatan',
    'dokter': 'Kesehatan',
    'obat': 'Kesehatan',
    'rumah sakit': 'Kesehatan',
    'hiburan': 'Hiburan',
    'nonton': 'Hiburan',
    'game': 'Hiburan',
    'hiburan': 'Hiburan',
    'pendidikan': 'Pendidikan',
    'sekolah': 'Pendidikan',
    'kuliah': 'Pendidikan',
    'kursus': 'Pendidikan',
    'gaji': 'Gaji',
    'salary': 'Gaji',
    'investasi': 'Investasi',
    'saham': 'Investasi',
    'reksadana': 'Investasi',
    'crypto': 'Investasi',
  };

  // Cek keyword map
  for (const [key, cat] of Object.entries(keywordMap)) {
    if (lower.includes(key)) return cat;
  }

  return null;
}

/**
 * Set budget untuk kategori tertentu di bulan berjalan.
 * @param {string} userId
 * @param {string} category - nama kategori (bisa fuzzy)
 * @param {number} amount - nominal budget dalam Rupiah
 * @returns {Promise<object>}
 */
async function setBudget(userId, category, amount) {
  const month = getCurrentMonth();

  // Validasi kategori dengan fuzzy match
  const normalizedCategory = matchCategory(category);
  if (!normalizedCategory) {
    return {
      success: false,
      message: `Kategori "${category}" tidak dikenali.\nKategori: Makanan & Minuman, Transportasi, Belanja, Tagihan & Utilitas, Kesehatan, Hiburan, Pendidikan, Gaji, Investasi, Lainnya`,
    };
  }

  if (!amount || amount <= 0) {
    return { success: false, message: 'Nominal budget harus lebih dari 0.' };
  }

  const budget = await prisma.budget.upsert({
    where: {
      userId_category_month: {
        userId,
        category: normalizedCategory,
        month,
      },
    },
    update: { amount: Math.round(amount) },
    create: {
      userId,
      category: normalizedCategory,
      amount: Math.round(amount),
      month,
    },
  });

  logger.info({ userId, category: normalizedCategory, amount, month }, 'Budget diupdate');

  return {
    success: true,
    message: `Budget *${normalizedCategory}* bulan ini diatur ke *${formatRupiah(amount)}*.`,
    budget,
  };
}

/**
 * Cek sisa budget untuk semua kategori di bulan berjalan.
 * Budget dikurangi oleh total pengeluaran di kategori yang sama.
 * @param {string} userId
 * @param {Array} transactions - data transaksi dari Google Sheets (expense saja)
 * @returns {Promise<object>}
 */
async function checkBudget(userId, transactions = []) {
  const month = getCurrentMonth();
  const budgets = await prisma.budget.findMany({
    where: { userId, month },
    orderBy: { category: 'asc' },
  });

  if (budgets.length === 0) {
    return {
      success: true,
      hasBudget: false,
      message: 'Anda belum mengatur budget bulan ini.\n\nGunakan: *set budget [kategori] [nominal]*\nContoh: `set budget makanan 800000`',
    };
  }

  // Hitung total pengeluaran per kategori dari transaksi
  const expenseByCategory = {};
  for (const tx of transactions) {
    if (tx.type === 'expense' || tx.tipe === 'Pengeluaran') {
      const cat = tx.category || tx.kategori || 'Lainnya';
      const amt = Number(tx.amount || tx.nominal || 0);
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amt;
    }
  }

  // Format hasil
  const lines = ['📊 *Budget Bulan Ini*\n'];
  for (const b of budgets) {
    const spent = expenseByCategory[b.category] || 0;
    const remaining = b.amount - spent;
    const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
    const bar = pct >= 100 ? '🟥' : pct >= 75 ? '🟧' : pct >= 50 ? '🟨' : '🟩';

    lines.push(
      `${bar} *${b.category}*\n` +
      `   Budget: ${formatRupiah(b.amount)}\n` +
      `   Terpakai: ${formatRupiah(spent)} (${pct}%)\n` +
      `   Sisa: *${formatRupiah(remaining < 0 ? 0 : remaining)}*` +
      (remaining < 0 ? ` ⚠️ *Over budget ${formatRupiah(Math.abs(remaining))}*` : '') +
      '\n'
    );
  }

  return { success: true, hasBudget: true, message: lines.join('\n') };
}

/**
 * Hapus budget untuk kategori tertentu.
 */
async function deleteBudget(userId, category) {
  const month = getCurrentMonth();
  const normalizedCategory = matchCategory(category);

  if (!normalizedCategory) {
    return { success: false, message: `Kategori "${category}" tidak valid.` };
  }

  const deleted = await prisma.budget.deleteMany({
    where: { userId, category: normalizedCategory, month },
  });

  if (deleted.count === 0) {
    return { success: false, message: `Tidak ada budget untuk kategori *${normalizedCategory}* bulan ini.` };
  }

  return { success: true, message: `Budget *${normalizedCategory}* bulan ini berhasil dihapus.` };
}

function formatRupiah(n) {
  return 'Rp' + Number(n || 0).toLocaleString('id-ID');
}

module.exports = { setBudget, checkBudget, deleteBudget, getCurrentMonth };
