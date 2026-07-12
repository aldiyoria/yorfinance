const { prisma } = require('../db/prisma');
const logger = require('../utils/logger');

/**
 * Append transaction to DB.
 * @param {object} opts { userId }
 * @param {object} tx - { date, type, category, item, amount, note }
 */
async function appendTransaction({ userId }, tx) {
  const record = await prisma.transaction.create({
    data: {
      userId,
      date: tx.date,
      type: tx.type,
      category: tx.category,
      item: tx.item,
      amount: tx.amount,
      note: tx.note || '',
    },
  });

  logger.info({ userId, item: tx.item, id: record.id }, 'Transaksi ditulis ke DB');
  return record;
}

/**
 * Read all transactions for a user.
 * @param {object} opts { userId }
 * @returns {Promise<Array<{date,type,category,item,amount,note}>>}
 */
async function readTransactions({ userId }) {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  return rows.map((r) => ({
    date: r.date,
    type: r.type,
    category: r.category,
    item: r.item,
    amount: r.amount,
    note: r.note || '',
  }));
}

/**
 * Read transactions with ID (for edit/delete).
 * @param {object} opts { userId }
 * @returns {Promise<Array<{id: string, date,type,category,item,amount,note}>>}
 */
async function readTransactionsWithIndex({ userId }) {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    type: r.type,
    category: r.category,
    item: r.item,
    amount: r.amount,
    note: r.note || '',
  }));
}

/**
 * Delete a transaction by ID.
 * @param {string} id - transaction ID
 */
async function deleteTransaction(id) {
  await prisma.transaction.delete({ where: { id } });
  logger.info({ id }, 'Transaksi dihapus dari DB');
}

/**
 * Update a transaction by ID.
 * @param {string} id - transaction ID
 * @param {object} data - { date?, type?, category?, item?, amount?, note? }
 */
async function updateTransaction(id, data) {
  await prisma.transaction.update({
    where: { id },
    data,
  });
  logger.info({ id }, 'Transaksi diupdate di DB');
}

/**
 * Delete all transactions for a user.
 * @param {string} userId
 */
async function clearAllTransactions(userId) {
  const count = await prisma.transaction.deleteMany({ where: { userId } });
  logger.info({ userId, count: count.count }, 'Semua transaksi dihapus dari DB');
  return count.count;
}

module.exports = {
  appendTransaction,
  readTransactions,
  readTransactionsWithIndex,
  deleteTransaction,
  updateTransaction,
  clearAllTransactions,
};
