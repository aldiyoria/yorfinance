const env = require('../config/env');

/**
 * Melindungi endpoint admin/subscription dengan API key sederhana.
 * Kirim header: x-api-key: <ADMIN_API_KEY>
 */
function requireApiKey(req, res, next) {
  const key = req.header('x-api-key');
  if (!key || key !== env.adminApiKey) {
    return res.status(401).json({ error: 'Unauthorized: API key tidak valid' });
  }
  next();
}

module.exports = requireApiKey;
