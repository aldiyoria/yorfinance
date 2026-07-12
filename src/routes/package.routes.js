const { Router } = require('express');
const { listActivePackages } = require('../controllers/package.controller');

const router = Router();

router.get('/', listActivePackages);

module.exports = router;
