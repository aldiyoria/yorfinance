const { prisma } = require('../db/prisma');
const { CATEGORIES } = require('../prompts/financePrompts');
const { encrypt, safeDecrypt } = require('../utils/encrypt');
const logger = require('../utils/logger');

const PERIOD_ALIASES = {
  'hari': 'hari', 'harian': 'hari', 'per hari': 'hari', '/hari': 'hari',
  'day': 'hari', 'per day': 'hari',
  'bulan': 'bulan', 'bulanan': 'bulan', 'per bulan': 'bulan', '/bulan': 'bulan',
  'month': 'bulan', 'per month': 'bulan',
  'minggu': 'minggu', 'mingguan': 'minggu', 'per minggu': 'minggu', '/minggu': 'minggu',
  'week': 'minggu', 'per week': 'minggu',
};

const DEFAULT_PERIOD = 'bulan';

function getCurrentPeriodKey(period) {
  const now = new Date();
  const local = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  if (period === 'hari') return local.toISOString().slice(0, 10);
  if (period === 'minggu') {
    const dayOfWeek = local.getUTCDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(local.getTime() - diff * 24 * 60 * 60 * 1000);
    return monday.toISOString().slice(0, 10);
  }
  return local.toISOString().slice(0, 7);
}

function parsePeriod(input) {
  if (!input) return null;
  const lower = input.trim().toLowerCase();
  for (const [alias, period] of Object.entries(PERIOD_ALIASES)) {
    if (lower === alias || lower.endsWith(' ' + alias) || lower.startsWith(alias + ' ')) return period;
  }
  return null;
}

function matchCategory(input) {
  const lower = input.toLowerCase().trim();
  const exact = CATEGORIES.find(c => c.toLowerCase() === lower);
  if (exact) return exact;
  const partial = CATEGORIES.find(c => c.toLowerCase().includes(lower));
  if (partial) return partial;
  const reverse = CATEGORIES.find(c => { const words = c.toLowerCase().split(/\s+/); return words.some(w => w.length > 3 && lower.includes(w)); });
  if (reverse) return reverse;
  const keywords = { 'makan': 'Makanan & Minuman', 'minum': 'Makanan & Minuman', 'food': 'Makanan & Minuman', 'transport': 'Transportasi', 'bensin': 'Transportasi', 'ojol': 'Transportasi', 'grab': 'Transportasi', 'gojek': 'Transportasi', 'belanja': 'Belanja', 'shopping': 'Belanja', 'tagihan': 'Tagihan & Utilitas', 'listrik': 'Tagihan & Utilitas', 'air': 'Tagihan & Utilitas', 'internet': 'Tagihan & Utilitas', 'pulsa': 'Tagihan & Utilitas', 'utilitas': 'Tagihan & Utilitas', 'kesehatan': 'Kesehatan', 'dokter': 'Kesehatan', 'obat': 'Kesehatan', 'hiburan': 'Hiburan', 'nonton': 'Hiburan', 'game': 'Hiburan', 'pendidikan': 'Pendidikan', 'sekolah': 'Pendidikan', 'kuliah': 'Pendidikan', 'kursus': 'Pendidikan', 'gaji': 'Gaji', 'salary': 'Gaji', 'investasi': 'Investasi', 'saham': 'Investasi', 'reksadana': 'Investasi', 'crypto': 'Investasi' };
  for (const [key, cat] of Object.entries(keywords)) { if (lower.includes(key)) return cat; }
  return null;
}

async function findExistingBudget(userId, periodKey, normalizedCategory) {
  const budgets = await prisma.budget.findMany({ where: { userId } });
  for (const b of budgets) { const decCat = safeDecrypt(b.category); if (b.month === periodKey && decCat === normalizedCategory) return b; }
  return null;
}

async function setBudget(userId, category, amount, period) {
  if (period === undefined || period === null) period = DEFAULT_PERIOD;
  const normalizedCategory = matchCategory(category);
  if (!normalizedCategory) return { success: false, message: 'Kategori "' + category + '" tidak dikenali.\nKategori: ' + CATEGORIES.join(', ') };
  if (!amount || amount <= 0) return { success: false, message: 'Nominal budget harus lebih dari 0.' };
  const periodKey = getCurrentPeriodKey(period);
  const existing = await findExistingBudget(userId, periodKey, normalizedCategory);
  const encryptedCategory = encrypt(normalizedCategory);
  let budget;
  if (existing) { budget = await prisma.budget.update({ where: { id: existing.id }, data: { amount: Math.round(amount) } }); }
  else { budget = await prisma.budget.create({ data: { userId, category: encryptedCategory, amount: Math.round(amount), month: periodKey } }); }
  const periodWord = period === 'hari' ? 'hari ini' : period === 'minggu' ? 'minggu ini' : 'bulan ini';
  const periodLabel = period === 'hari' ? 'per hari' : period === 'minggu' ? 'per minggu' : 'per bulan';
  return { success: true, message: 'Budget *' + normalizedCategory + '* ' + periodWord + ' diatur ke *' + formatRupiah(amount) + '* ' + periodLabel + '.', budget: { ...budget, category: normalizedCategory } };
}

async function checkBudget(userId, transactions, period) {
  if (transactions === undefined) transactions = [];
  const periodsToCheck = period ? [period] : ['hari', 'bulan'];
  const currentDay = getCurrentPeriodKey('hari');
  const currentMonth = getCurrentPeriodKey('bulan');
  const allBudgets = await prisma.budget.findMany({ where: { userId }, orderBy: { category: 'asc' } });
  if (allBudgets.length === 0) return { success: true, hasBudget: false, message: 'Anda belum mengatur budget.\n\nGunakan: *set budget [kategori] [nominal]*\nContoh: `set budget makanan 800000`' };
  const budgetsByPeriod = {};
  for (const b of allBudgets) { const cat = safeDecrypt(b.category); const key = b.month.length === 10 ? 'hari' : 'bulan'; if (!budgetsByPeriod[key]) budgetsByPeriod[key] = []; budgetsByPeriod[key].push({ ...b, category: cat }); }
  const dayExpense = {}; const monthExpense = {};
  for (const tx of transactions) { if (tx.type === 'expense' || tx.tipe === 'Pengeluaran') { const cat = tx.category || tx.kategori || 'Lainnya'; const amt = Number(tx.amount || tx.nominal || 0); const txDate = tx.date || ''; if (txDate && txDate.substring(0, 10) === currentDay) dayExpense[cat] = (dayExpense[cat] || 0) + amt; if (txDate && txDate.substring(0, 7) === currentMonth) monthExpense[cat] = (monthExpense[cat] || 0) + amt; } }
  const lines = ['\uD83D\uDCCA *Budget Anda*\n'];
  for (const p of periodsToCheck) { const budgets = budgetsByPeriod[p] || []; if (budgets.length === 0) continue; lines.push('*' + (p === 'hari' ? 'Harian' : 'Bulanan') + '*'); for (const b of budgets) { const spent = p === 'hari' ? (dayExpense[b.category] || 0) : (monthExpense[b.category] || 0); const remaining = b.amount - spent; const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0; const bar = pct >= 100 ? '\uD83D\uDFE5' : pct >= 75 ? '\uD83D\uDFE7' : pct >= 50 ? '\uD83D\uDFE8' : '\uD83D\uDFE9'; lines.push(bar + ' *' + b.category + '*\n   Budget: ' + formatRupiah(b.amount) + '\n   Terpakai: ' + formatRupiah(spent) + ' (' + pct + '%)\n   Sisa: *' + formatRupiah(remaining < 0 ? 0 : remaining) + '*' + (remaining < 0 ? ' \u26A0\uFE0F *Over ' + formatRupiah(Math.abs(remaining)) + '*' : '')); } }
  if (lines.length === 1) lines.push('Belum ada budget untuk periode ini.');
  return { success: true, hasBudget: true, message: lines.join('\n') };
}

async function deleteBudget(userId, category) {
  const periodKey = getCurrentPeriodKey(DEFAULT_PERIOD);
  const normalizedCategory = matchCategory(category);
  if (!normalizedCategory) return { success: false, message: 'Kategori "' + category + '" tidak valid.' };
  const existing = await findExistingBudget(userId, periodKey, normalizedCategory);
  if (!existing) return { success: false, message: 'Tidak ada budget untuk kategori *' + normalizedCategory + '* bulan ini.' };
  await prisma.budget.delete({ where: { id: existing.id } });
  return { success: true, message: 'Budget *' + normalizedCategory + '* berhasil dihapus.' };
}

function formatRupiah(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }

module.exports = { setBudget, checkBudget, deleteBudget, getCurrentPeriodKey, parsePeriod };
