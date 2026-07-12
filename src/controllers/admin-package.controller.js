const packageService = require('../services/package.service');
const logger = require('../utils/logger');

/**
 * GET /api/admin/packages
 */
async function listPackages(req, res) {
  try {
    const packages = await packageService.listPackages();
    return res.json({ packages });
  } catch (err) {
    logger.error({ err }, 'Failed to list packages');
    return res.status(500).json({ error: 'Gagal mengambil data paket' });
  }
}

/**
 * GET /api/admin/packages/:id
 */
async function getPackage(req, res) {
  try {
    const pkg = await packageService.getPackageById(req.params.id);
    if (!pkg) return res.status(404).json({ error: 'Paket tidak ditemukan' });
    return res.json({ package: pkg });
  } catch (err) {
    logger.error({ err }, 'Failed to get package');
    return res.status(500).json({ error: 'Gagal mengambil data paket' });
  }
}

/**
 * POST /api/admin/packages
 */
async function createPackage(req, res) {
  try {
    const { slug, name, description, price, durationDays, features, isActive, isPopular, sortOrder } = req.body;

    if (!slug || !name || price === undefined) {
      return res.status(400).json({ error: 'Field "slug", "name", dan "price" wajib diisi' });
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Slug hanya boleh huruf kecil, angka, dan dash' });
    }

    const pkg = await packageService.createPackage({
      slug, name, description, price, durationDays, features, isActive, isPopular, sortOrder,
    });
    return res.status(201).json({ package: pkg });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Slug sudah digunakan' });
    }
    logger.error({ err }, 'Failed to create package');
    return res.status(500).json({ error: 'Gagal membuat paket' });
  }
}

/**
 * PUT /api/admin/packages/:id
 */
async function updatePackage(req, res) {
  try {
    const { slug, name, description, price, durationDays, features, isActive, isPopular, sortOrder } = req.body;

    const pkg = await packageService.updatePackage(req.params.id, {
      ...(slug !== undefined && { slug }),
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(price !== undefined && { price }),
      ...(durationDays !== undefined && { durationDays }),
      ...(features !== undefined && { features }),
      ...(isActive !== undefined && { isActive }),
      ...(isPopular !== undefined && { isPopular }),
      ...(sortOrder !== undefined && { sortOrder }),
    });
    return res.json({ package: pkg });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Slug sudah digunakan' });
    }
    logger.error({ err }, 'Failed to update package');
    return res.status(500).json({ error: 'Gagal update paket' });
  }
}

/**
 * DELETE /api/admin/packages/:id
 */
async function deletePackage(req, res) {
  try {
    await packageService.deletePackage(req.params.id);
    return res.json({ message: 'Paket berhasil dihapus' });
  } catch (err) {
    logger.error({ err }, 'Failed to delete package');
    return res.status(500).json({ error: 'Gagal menghapus paket' });
  }
}

/**
 * PATCH /api/admin/packages/:id/toggle
 */
async function togglePackage(req, res) {
  try {
    const pkg = await packageService.togglePackage(req.params.id);
    return res.json({ package: pkg });
  } catch (err) {
    logger.error({ err }, 'Failed to toggle package');
    return res.status(500).json({ error: 'Gagal toggle paket' });
  }
}

module.exports = { listPackages, getPackage, createPackage, updatePackage, deletePackage, togglePackage };
