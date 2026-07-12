const express = require('express');
const { createSubscription, getRedeemCode } = require('../controllers/subscription.controller');
const requireApiKey = require('../middlewares/apiKey.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/subscriptions:
 *   post:
 *     tags: [Subscription]
 *     summary: Buat subscription baru
 *     description: |
 *       Membuat subscription baru untuk user.
 *       Kode redeem akan dikirim ke email yang diinput.
 *       Status subscription: PENDING (belum diredeem).
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSubscriptionRequest'
 *     responses:
 *       201:
 *         description: Subscription berhasil dibuat
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateSubscriptionResponse'
 *       400:
 *         description: Field wajib tidak diisi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: API key tidak valid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/subscriptions', requireApiKey, createSubscription);

/**
 * @swagger
 * /api/subscriptions/{id}/redeem-code:
 *   get:
 *     tags: [Subscription]
 *     summary: Ambil redeem code by subscription ID
 *     description: Mengembalikan redeem code dan status subscription berdasarkan ID.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Subscription ID
 *         example: cmr1234567890
 *     responses:
 *       200:
 *         description: Redeem code ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RedeemCodeResponse'
 *       401:
 *         description: API key tidak valid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Subscription tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/subscriptions/:id/redeem-code', requireApiKey, getRedeemCode);

module.exports = router;
