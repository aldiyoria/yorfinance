const { Router } = require('express');
const { getDashboardData } = require('../controllers/dashboard.controller');

const router = Router();

/**
 * @swagger
 * /api/dashboard/{token}:
 *   get:
 *     summary: Get dashboard data
 *     tags: [Dashboard]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: User's unique dashboard token
 *     responses:
 *       200:
 *         description: Dashboard data (summary, charts, transactions)
 *       404:
 *         description: Invalid token
 */
router.get('/:token', getDashboardData);

module.exports = router;
