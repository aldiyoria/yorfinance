const { prisma } = require('../db/prisma');
const { encrypt, safeDecrypt } = require('../utils/encrypt');
const logger = require('../utils/logger');

const ENCRYPTED_FIELDS = ['item', 'note', 'category'];

function encryptTx(tx) {
  const out = { ...tx };
  for (const f of ENCRYPTED_FIELDS) {
    if (out[f] != null) out[f] = encrypt(out[f]);
  }
  return out;
}

function decryptTx(row) {
  const out = { ...row };
  for (const f of ENCRYPTED_FIELDS) {
    if (out[f] != null) out[f] = safeDecrypt(out[f]);
  }
  return out;
}

function decryptTxList(rows) {
  return rows.map(decryptTx);
}

/**
 * Append transaction to DB (sensitive fields encrypted).
 */
async function appendTransaction({ userId }, tx) {
  const encrypted = encryptTx({
    date: tx.date,
    type: tx.type,
    category: tx.category,
    item: tx.item,
    amount: tx.amount,
    note: tx.note || '',
  });

  const record = await prisma.transaction.create({
    data: {
      userId,
      ...encrypted,
    },
  });

  logger.info({ userId, id: record.id }, 'Transaksi ditulis ke DB');
  return decryptTx(record);
}

/**
 * Read all transactions for a user (decrypted).
 */
async function readTransactions({ userId }) {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  return decryptTxList(rows);
}

/**
 * Read transactions with ID (for edit/delete) — decrypted.
 */
async function readTransactionsWithIndex({ userId }) {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  return decryptTxList(rows);
}

/**
 * Delete a transaction by ID.
 */
async function deleteTransaction(id) {
  await prisma.transaction.delete({ where: { id } });
  logger.info({ id }, 'Transaksi dihapus dari DB');
}

/**
 * Update a transaction by ID (encrypt fields if provided).
 */
async function updateTransaction(id, data) {
  const encrypted = {};
  for (const [key, val] of Object.entries(data)) {
    if (ENCRYPTED_FIELDS.includes(key)) {
      encrypted[key] = encrypt(val);
    } else {
      encrypted[key] = val;
    }
  }

  await prisma.transaction.update({
    where: { id },
    data: encrypted,
  });
  logger.info({ id }, 'Transaksi diupdate di DB');
}

/**
 * Delete all transactions for a user.
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
