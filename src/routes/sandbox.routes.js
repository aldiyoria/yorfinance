const { Router } = require('express');
const { simulatePaymentCallback, resetUser, listPayments } = require('../controllers/sandbox.controller');

const router = Router();

/**
 * @swagger
 * /api/sandbox/payment-callback:
 *   post:
 *     summary: "[SANDBOX] Simulate iPaymu payment callback"
 *     description: |
 *       Simulate callback dari iPaymu. Gunakan endpoint ini untuk testing flow pembayaran tanpa perlu iPaymu real.
 *
 *       **Cara pakai:**
 *       1. Buat checkout via `POST /api/payments/create`
 *       2. Copy `externalId` dari response
 *       3. Hit endpoint ini dengan `externalId` tersebut
 *       4. Payment otomatis PAID + subscription aktif + email redeem code terkirim
 *     tags: [Sandbox]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [externalId]
 *             properties:
 *               externalId:
 *                 type: string
 *                 description: "External ID dari checkout (contoh: YF-cmxxx-1720...) "
 *                 example: "YF-cmrmz1234567890-1720798800000"
 *               status:
 *                 type: string
 *                 enum: [SUCCESS, FAILED]
 *                 description: "Status pembayaran (default: SUCCESS)"
 *                 default: SUCCESS
 *     responses:
 *       200:
 *         description: Notification berhasil, payment sudah SUCCESS
 *       400:
 *         description: Payment tidak ditemukan
 *       404:
 *         description: Invoice belum dibuat
 */
router.post('/payment-callback', simulatePaymentCallback);

/**
 * @swagger
 * /api/sandbox/reset-user:
 *   post:
 *     summary: "[SANDBOX] Reset user untuk testing ulang"
 *     description: |
 *       Hapus user, payments, dan subscription. Untuk testing dari awal lagi.
 *     tags: [Sandbox]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 description: Email user yang mau direset
 *     responses:
 *       200:
 *         description: User berhasil dihapus
 */
router.post('/reset-user', resetUser);

/**
 * @swagger
 * /api/sandbox/payments:
 *   get:
 *     summary: "[SANDBOX] List semua payments"
 *     description: Lihat semua payment records tanpa perlu API key (untuk debugging).
 *     tags: [Sandbox]
 *     responses:
 *       200:
 *         description: Daftar payments
 */
router.get('/payments', listPayments);

module.exports = router;
