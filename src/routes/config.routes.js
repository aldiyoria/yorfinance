const { Router } = require('express');
const { getBotConfig } = require('../controllers/config.controller');

const router = Router();
router.get('/', getBotConfig);

module.exports = router;
