const { readTransactions } = require('./transaction.service');
const logger = require('../utils/logger');

/**
 * Mengagregasi transaksi user menjadi ringkasan yang siap dikirim ke OpenAI
 * untuk dijawab secara natural. Menghitung total bulan & minggu berjalan
 * serta breakdown per kategori.
 * @param {object} opts { userId }
 */
async function buildAggregate({ userId }) {
  const txs = await readTransactions({ userId });
  const now = new Date();

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Senin sebagai awal minggu
  startOfWeek.setHours(0, 0, 0, 0);

  const acc = {
    generatedAt: now.toISOString(),
    month: { income: 0, expense: 0, byCategory: {}, count: 0 },
    week: { income: 0, expense: 0, count: 0 },
    total: { income: 0, expense: 0 },
  };

  for (const t of txs) {
    const d = new Date(t.date);
    acc.total[t.type] += t.amount;

    if (d >= startOfMonth) {
      acc.month[t.type] += t.amount;
      acc.month.count += 1;
      if (t.type === 'expense') {
        acc.month.byCategory[t.category] = (acc.month.byCategory[t.category] || 0) + t.amount;
      }
    }
    if (d >= startOfWeek) {
      acc.week[t.type] += t.amount;
      acc.week.count += 1;
    }
  }

  return acc;
}

/**
 * Format ringkasan bulanan terstruktur + insight keuangan.
 * @param {object} aggregate - hasil dari buildAggregate
 * @returns {string} teks balasan terformat
 */
function buildStructuredSummary(aggregate) {
  const now = new Date();
  const monthName = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const m = aggregate.month;

  const totalIncome = m.income;
  const totalExpense = m.expense;
  const selisih = totalIncome - totalExpense;
  const txCount = m.count;

  // Cari kategori pengeluaran tertinggi
  let topCategory = '';
  let topAmount = 0;
  for (const [cat, amt] of Object.entries(m.byCategory)) {
    if (amt > topAmount) {
      topAmount = amt;
      topCategory = cat;
    }
  }

  // Format output
  const lines = [];
  lines.push(`📊 *Rekap Keuangan ${monthName}*\n`);

  // Ringkasan utama
  lines.push('💰 *Ringkasan Utama*\n');
  lines.push(`• Total Pemasukan: *${formatRupiah(totalIncome)}*`);
  lines.push(`• Total Pengeluaran: *${formatRupiah(totalExpense)}*`);
  lines.push(`• Selisih: *${selisih >= 0 ? '+' : ''}${formatRupiah(selisih)}* ${selisih >= 0 ? '✅' : '⚠️'}`);
  lines.push(`• Total Transaksi: *${txCount} kali*\n`);

  // Breakdown pengeluaran per kategori
  if (Object.keys(m.byCategory).length > 0) {
    lines.push('📂 *Pengeluaran per Kategori*\n');

    // Sort by amount descending
    const sorted = Object.entries(m.byCategory).sort((a, b) => b[1] - a[1]);
    for (const [cat, amt] of sorted) {
      const pct = totalExpense > 0 ? Math.round((amt / totalExpense) * 100) : 0;
      const bar = pct >= 30 ? '🔴' : pct >= 20 ? '🟠' : pct >= 10 ? '🟡' : '🟢';
      lines.push(`${bar} ${cat}: ${formatRupiah(amt)} (${pct}%)`);
    }
    lines.push('');
  }

  // Pengeluaran tertinggi
  if (topCategory) {
    lines.push(`🏆 *Kategori Tertinggi:* ${topCategory} — ${formatRupiah(topAmount)}\n`);
  }

  // Insight & saran
  lines.push('💡 *Insight & Saran*\n');
  const insights = generateInsights(totalIncome, totalExpense, selisih, txCount, topCategory, topAmount, m.byCategory);
  for (const insight of insights) {
    lines.push(`${insight}\n`);
  }

  return lines.join('\n');
}

/**
 * Generate insight dan saran management keuangan berdasarkan data.
 */
function generateInsights(income, expense, selisih, txCount, topCat, topAmt, byCategory) {
  const insights = [];
  const savingsRate = income > 0 ? ((selisih / income) * 100) : 0;

  // Rasio tabungan
  if (income > 0) {
    if (savingsRate >= 30) {
      insights.push('✅ Rasio tabungan Anda sangat baik (>30%). Pertahankan!');
    } else if (savingsRate >= 20) {
      insights.push('👍 Rasio tabungan Anda cukup baik (20-30%). Coba tingkatkan sedikit lagi.');
    } else if (savingsRate >= 0) {
      insights.push('⚠️ Rasio tabungan Anda di bawah 20%. Cobalah kurangi pengeluaran non-esensial.');
    } else {
      insights.push('🔴 Pengeluaran melebihi pemasukan bulan ini. Evaluasi pengeluaran segera.');
    }
  }

  // Konsentrasi pengeluaran
  if (topCat && income > 0) {
    const topPct = income > 0 ? Math.round((topAmt / income) * 100) : 0;
    if (topPct > 40) {
      insights.push(`⚠️ Pengeluaran terbesar di "${topCat}" menghabiskan ${topPct}% dari pemasukan. Pertimbangkan untuk mengurangi.`);
    }
  }

  // Frekuensi transaksi
  if (txCount > 30) {
    insights.push('📝 Anda sangat aktif bertransaksi (>30 kali). Pastikan semua pengeluaran memang esensial.');
  } else if (txCount < 5 && txCount > 0) {
    insights.push('📝 Transaksi Anda masih sedikit. Mulai catat semua pengeluaran agar data lebih akurat.');
  }

  // Selisih negatif
  if (selisih < 0) {
    insights.push(`🚨 Defisit ${formatRupiah(Math.abs(selisih))}. Cari cara tambah pemasukan atau kurangi pengeluaran.`);
  }

  // Tips umum
  if (selisih >= 0 && income > 0) {
    if (savingsRate < 20) {
      insights.push('💡 Coba terapkan aturan 50/30/20: 50% kebutuhan, 30% keinginan, 20% tabungan.');
    }
  }

  // Kategori yang perlu diperhatikan
  const highCats = Object.entries(byCategory).filter(([, amt]) => income > 0 && (amt / income) > 0.25);
  if (highCats.length > 0) {
    const catNames = highCats.map(([cat]) => cat).join(', ');
    insights.push(`💡 Kategori yang perlu diperhatikan: ${catNames} — masing-masing >25% dari pemasukan.`);
  }

  if (insights.length === 0) {
    insights.push('💡 Terus pantau keuangan Anda secara rutin untuk menjaga kesehatan finansial.');
  }

  return insights;
}

function formatRupiah(n) {
  return 'Rp' + Number(n || 0).toLocaleString('id-ID');
}

/**
 * Filter transaksi berdasarkan rentang tanggal.
 * @param {string} userId
 * @param {Date} startDate - inclusive
 * @param {Date} endDate - inclusive (end of day)
 * @returns {Promise<Array>}
 */
async function filterTransactionsByDate({ userId }, startDate, endDate) {
  const txs = await readTransactions({ userId });
  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  return txs.filter((t) => {
    const d = new Date(t.date);
    return d >= startDate && d <= endOfDay;
  });
}

/**
 * Format rekap transaksi dalam bentuk list (untuk /hari, /minggu, /bulan, /tanggal).
 * @param {Array} txs - filtered transactions
 * @param {string} label - label periode (contoh: "12 Juli 2026", "7-12 Juli 2026", "Juli 2026")
 * @returns {string}
 */
function buildRecapList(txs, label) {
  if (txs.length === 0) {
    return `📋 *Rekap ${label}*\n\nTidak ada transaksi pada periode ini.`;
  }

  let totalIncome = 0;
  let totalExpense = 0;
  const incomeList = [];
  const expenseList = [];

  for (const t of txs) {
    if (t.type === 'income') {
      totalIncome += t.amount;
      incomeList.push(t);
    } else {
      totalExpense += t.amount;
      expenseList.push(t);
    }
  }

  const lines = [];
  lines.push(`📋 *Rekap ${label}*\n`);

  // Pengeluaran
  if (expenseList.length > 0) {
    lines.push(`🔴 *Pengeluaran (${expenseList.length} transaksi)*\n`);
    for (const t of expenseList) {
      lines.push(`• ${t.date} — ${t.item} [${t.category}]`);
      lines.push(`  ${formatRupiah(t.amount)}`);
    }
    lines.push(`\n*Total Pengeluaran: ${formatRupiah(totalExpense)}*\n`);
  }

  // Pemasukan
  if (incomeList.length > 0) {
    lines.push(`🟢 *Pemasukan (${incomeList.length} transaksi)*\n`);
    for (const t of incomeList) {
      lines.push(`• ${t.date} — ${t.item} [${t.category}]`);
      lines.push(`  ${formatRupiah(t.amount)}`);
    }
    lines.push(`\n*Total Pemasukan: ${formatRupiah(totalIncome)}*\n`);
  }

  // Ringkasan
  const selisih = totalIncome - totalExpense;
  lines.push('📊 *Ringkasan*');
  lines.push(`• Pemasukan: *${formatRupiah(totalIncome)}*`);
  lines.push(`• Pengeluaran: *${formatRupiah(totalExpense)}*`);
  lines.push(`• Selisih: *${selisih >= 0 ? '+' : ''}${formatRupiah(selisih)}* ${selisih >= 0 ? '✅' : '⚠️'}`);

  return lines.join('\n');
}

module.exports = { buildAggregate, buildStructuredSummary, filterTransactionsByDate, buildRecapList };
