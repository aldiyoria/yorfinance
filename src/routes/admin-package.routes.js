const { Router } = require('express');
const { listPackages, getPackage, createPackage, updatePackage, deletePackage, togglePackage } = require('../controllers/admin-package.controller');
const requireApiKey = require('../middlewares/apiKey.middleware');

const router = Router();

router.use(requireApiKey);

router.get('/', listPackages);
router.get('/:id', getPackage);
router.post('/', createPackage);
router.put('/:id', updatePackage);
router.delete('/:id', deletePackage);
router.patch('/:id/toggle', togglePackage);

module.exports = router;
