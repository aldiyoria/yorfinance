const { Router } = require('express');
const { createInvoice, paymentCallback, getPaymentStatus, listPayments } = require('../controllers/payment.controller');
const apiKeyMiddleware = require('../middlewares/apiKey.middleware');

const router = Router();

/**
 * @swagger
 * /api/payments/create:
 *   post:
 *     summary: Buat DOKU Checkout untuk pembayaran
 *     tags: [Payments]
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
 *               name:
 *                 type: string
 *               plan:
 *                 type: string
 *     responses:
 *       201:
 *         description: Invoice berhasil dibuat
 */
router.post('/create', createInvoice);

/**
 * @swagger
 * /api/payments/callback:
 *   post:
 *     summary: HTTP Notification dari DOKU
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: OK
 */
router.post('/callback', paymentCallback);

/**
 * @swagger
 * /api/payments/status/{externalId}:
 *   get:
 *     summary: Cek status pembayaran
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: externalId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status pembayaran
 */
router.get('/status/:externalId', getPaymentStatus);

/**
 * @swagger
 * /api/payments:
 *   get:
 *     summary: List semua payments (admin)
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Daftar payments
 */
router.get('/', apiKeyMiddleware, listPayments);

module.exports = router;
