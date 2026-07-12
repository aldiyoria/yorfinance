const { sheets } = require('../config/google');
const env = require('../config/env');
const logger = require('../utils/logger');

const HEADER_ROW = ['Tanggal', 'Tipe', 'Kategori', 'Item', 'Nominal', 'Catatan', 'Dicatat Pada'];
const TEMPLATE_SHEET_NAME = 'Template';
const SERVICE_ACCOUNT_EMAIL = 'yorfinance@yorfinance.iam.gserviceaccount.com';

/**
 * Retry wrapper untuk API call yang bisa kena transient error (ECONNRESET, dll).
 * @param {Function} fn
 * @param {number} maxRetries
 * @returns {Promise<*>}
 */
async function withRetry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isTransient = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message?.includes('fetch failed');
      if (isTransient && attempt < maxRetries) {
        const delay = 1000 * attempt;
        logger.warn({ attempt, delay, code: err.code }, 'Transient error, retrying...');
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Copy sheet "Template" ke sheet baru untuk user, rename, protect (hanya bot yang bisa edit).
 * @param {object} opts { userName }
 * @returns {Promise<{ sheetId: number, sheetName: string }>}
 */
async function createUserSheet({ userName }) {
  const spreadsheetId = env.google.spreadsheetId;

  // 1. Dapatkan info spreadsheet untuk cari sheetId "Template"
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });

  const templateSheet = meta.data.sheets.find(
    (s) => s.properties.title === TEMPLATE_SHEET_NAME
  );

  if (!templateSheet) {
    throw new Error(`Sheet "${TEMPLATE_SHEET_NAME}" tidak ditemukan di spreadsheet master. Buat sheet "Template" terlebih dahulu.`);
  }

  const templateSheetId = templateSheet.properties.sheetId;

  // 2. Copy "Template" ke sheet baru
  const copyRes = await sheets.spreadsheets.sheets.copyTo({
    spreadsheetId,
    sheetId: templateSheetId,
    requestBody: {
      destinationSpreadsheetId: spreadsheetId,
    },
  });

  const newSheetId = copyRes.data.sheetId;
  const sheetName = userName || `User_${Date.now()}`;

  // 3. Rename + protect sheet (hanya service account yang bisa edit)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId: newSheetId,
              title: sheetName,
            },
            fields: 'title',
          },
        },
        {
          addProtectedRange: {
            protectedRange: {
              range: {
                sheetId: newSheetId,
              },
              description: `Sheet milik ${sheetName} — hanya bot yang bisa menulis`,
              warningOnly: false,
              editors: {
                users: [SERVICE_ACCOUNT_EMAIL],
              },
            },
          },
        },
      ],
    },
  });

  logger.info({ sheetId: newSheetId, sheetName }, 'Sheet user berhasil dibuat (protected, bot-only edit)');

  return { sheetId: newSheetId, sheetName };
}

/**
 * Menambahkan satu baris transaksi ke sheet user.
 * @param {object} opts { sheetName }
 * @param {object} tx - transaksi ternormalisasi
 */
async function appendTransaction({ sheetName }, tx) {
  const spreadsheetId = env.google.spreadsheetId;

  const row = [
    tx.date,
    tx.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
    tx.category,
    tx.item,
    tx.amount,
    tx.note || '',
    new Date().toISOString(),
  ];

  await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${sheetName}'!A:G`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [row],
      },
    })
  );

  logger.info({ sheetName, item: tx.item }, 'Transaksi ditulis ke Google Sheets');
}

/**
 * Membaca seluruh transaksi dari sheet user.
 * @param {object} opts { sheetName }
 * @returns {Promise<Array<{date,type,category,item,amount,note}>>}
 */
async function readTransactions({ sheetName }) {
  const spreadsheetId = env.google.spreadsheetId;

  const response = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A2:G`,
    })
  );

  const rows = response.data.values || [];
  return rows.map((row) => ({
    date: row[0] || '',
    type: row[1] === 'Pemasukan' ? 'income' : 'expense',
    category: row[2] || 'Lainnya',
    item: row[3] || '',
    amount: Number(row[4]) || 0,
    note: row[5] || '',
  }));
}

module.exports = { createUserSheet, appendTransaction, readTransactions };
