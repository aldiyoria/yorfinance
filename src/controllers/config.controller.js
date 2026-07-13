const env = require('../config/env');
const { getTrialPackage } = require('./trial.controller');

/**
 * GET /api/config
 * Public endpoint — return bot config + trial info for frontend.
 */
async function getBotConfig(_req, res) {
  try {
    const trialPkg = await getTrialPackage();
    res.json({
      botUsername: env.telegram.botUsername,
      botLink: `https://t.me/${env.telegram.botUsername}`,
      appName: 'YorFinance',
      trial: trialPkg
        ? { trialDays: trialPkg.trialDays, name: trialPkg.name, description: trialPkg.description }
        : null,
    });
  } catch {
    res.json({
      botUsername: env.telegram.botUsername,
      botLink: `https://t.me/${env.telegram.botUsername}`,
      appName: 'YorFinance',
      trial: null,
    });
  }
}

module.exports = { getBotConfig };
