const packageService = require('../services/package.service');
const logger = require('../utils/logger');

/**
 * GET /api/packages
 * Public endpoint — list active packages for checkout/landing.
 */
async function listActivePackages(req, res) {
  try {
    const packages = await packageService.listActivePackages();
    return res.json({ packages });
  } catch (err) {
    logger.error({ err }, 'Failed to list active packages');
    return res.status(500).json({ error: 'Gagal mengambil data paket' });
  }
}

module.exports = { listActivePackages };
