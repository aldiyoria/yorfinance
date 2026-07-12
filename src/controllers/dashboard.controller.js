const { prisma } = require('../db/prisma');
const { readTransactions } = require('../services/transaction.service');
const logger = require('../utils/logger');

function formatRupiah(n) {
  return 'Rp' + Number(n || 0).toLocaleString('id-ID');
}

/**
 * GET /api/dashboard/:token
 * Return aggregated financial data for the dashboard.
 */
async function getDashboardData(req, res) {
  try {
    const { token } = req.params;

    const user = await prisma.user.findUnique({
      where: { dashboardToken: token },
      include: { subscription: true, budgets: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Invalid dashboard token' });
    }

    // Read all transactions
    const txs = await readTransactions({ userId: user.id });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);

    // Aggregate
    let totalIncome = 0;
    let totalExpense = 0;
    let monthIncome = 0;
    let monthExpense = 0;
    let weekIncome = 0;
    let weekExpense = 0;
    const byCategory = {};
    const byMonth = {};
    const byDay = {};
    const recentTransactions = [];

    for (const t of txs) {
      const d = new Date(t.date);
      totalIncome += t.type === 'income' ? t.amount : 0;
      totalExpense += t.type === 'expense' ? t.amount : 0;

      if (d >= startOfMonth) {
        monthIncome += t.type === 'income' ? t.amount : 0;
        monthExpense += t.type === 'expense' ? t.amount : 0;
      }

      if (d >= startOfWeek) {
        weekIncome += t.type === 'income' ? t.amount : 0;
        weekExpense += t.type === 'expense' ? t.amount : 0;
      }

      // By category (expense only)
      if (t.type === 'expense') {
        byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
      }

      // By month
      const monthKey = t.date.substring(0, 7); // YYYY-MM
      if (!byMonth[monthKey]) byMonth[monthKey] = { income: 0, expense: 0 };
      byMonth[monthKey][t.type] += t.amount;

      // By day (last 30 days)
      const dayKey = t.date.substring(0, 10); // YYYY-MM-DD
      if (!byDay[dayKey]) byDay[dayKey] = { income: 0, expense: 0 };
      byDay[dayKey][t.type] += t.amount;
    }

    // Recent transactions (last 20)
    recentTransactions.push(...txs.slice(-20).reverse());

    // Budget status
    const currentMonth = now.toISOString().substring(0, 7);
    const budgets = user.budgets
      .filter((b) => b.month === currentMonth)
      .map((b) => ({
        category: b.category,
        budget: b.amount,
        spent: byCategory[b.category] || 0,
      }));

    res.json({
      user: {
        name: user.name,
        email: user.email,
      },
      summary: {
        totalIncome,
        totalExpense,
        totalBalance: totalIncome - totalExpense,
        txCount: txs.length,
        monthIncome,
        monthExpense,
        monthBalance: monthIncome - monthExpense,
        monthTxCount: txs.filter((t) => new Date(t.date) >= startOfMonth).length,
        weekIncome,
        weekExpense,
        weekBalance: weekIncome - weekExpense,
      },
      byCategory,
      byMonth,
      byDay,
      budgets,
      recentTransactions,
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, 'Dashboard API error');
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getDashboardData };
