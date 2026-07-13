const { Router } = require('express');
const { createTrial } = require('../controllers/trial.controller');

const router = Router();

/**
 * @swagger
 * /api/trial:
 *   post:
 *     tags: [Trial]
 *     summary: Aktifkan Free Trial 3 Hari
 *     description: |
 *       Membuat subscription free trial selama 3 hari.
 *       Kode redeem akan dikirim ke email yang diinput.
 *       Tidak memerlukan pembayaran.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email user
 *               name:
 *                 type: string
 *                 description: Nama user (opsional)
 *     responses:
 *       201:
 *         description: Free trial berhasil dibuat
 *       400:
 *         description: Email wajib diisi
 *       409:
 *         description: Email sudah terdaftar
 *       500:
 *         description: Server error
 */
router.post('/', createTrial);

module.exports = router;
