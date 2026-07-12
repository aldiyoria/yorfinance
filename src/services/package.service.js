const { prisma } = require('../db/prisma');
const logger = require('../utils/logger');

/**
 * List all packages (admin).
 */
async function listPackages() {
  return prisma.package.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

/**
 * List active packages (public).
 */
async function listActivePackages() {
  return prisma.package.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      price: true,
      durationDays: true,
      features: true,
      isPopular: true,
    },
  });
}

/**
 * Get package by ID.
 */
async function getPackageById(id) {
  return prisma.package.findUnique({ where: { id } });
}

/**
 * Get package by slug.
 */
async function getPackageBySlug(slug) {
  return prisma.package.findUnique({ where: { slug } });
}

/**
 * Create package.
 */
async function createPackage({ slug, name, description, price, durationDays, features, isActive, isPopular, sortOrder }) {
  const pkg = await prisma.package.create({
    data: {
      slug,
      name,
      description: description || null,
      price,
      durationDays: durationDays || 30,
      features: features || [],
      isActive: isActive !== false,
      isPopular: isPopular || false,
      sortOrder: sortOrder || 0,
    },
  });
  logger.info({ packageId: pkg.id, slug: pkg.slug }, 'Package created');
  return pkg;
}

/**
 * Update package.
 */
async function updatePackage(id, data) {
  const pkg = await prisma.package.update({
    where: { id },
    data,
  });
  logger.info({ packageId: pkg.id, slug: pkg.slug }, 'Package updated');
  return pkg;
}

/**
 * Delete package.
 */
async function deletePackage(id) {
  const pkg = await prisma.package.delete({ where: { id } });
  logger.info({ packageId: pkg.id, slug: pkg.slug }, 'Package deleted');
  return pkg;
}

/**
 * Toggle package active status.
 */
async function togglePackage(id) {
  const pkg = await prisma.package.findUnique({ where: { id } });
  if (!pkg) throw new Error('Package not found');

  const updated = await prisma.package.update({
    where: { id },
    data: { isActive: !pkg.isActive },
  });
  logger.info({ packageId: updated.id, slug: updated.slug, isActive: updated.isActive }, 'Package toggled');
  return updated;
}

/**
 * Seed default packages if none exist.
 */
async function seedDefaults() {
  const count = await prisma.package.count();
  if (count > 0) return null;

  const pkg = await prisma.package.create({
    data: {
      slug: 'basic',
      name: 'Basic',
      description: 'Paket standar untuk pribadi',
      price: 29000,
      durationDays: 30,
      features: [
        'Catat transaksi via chat',
        'Foto struk (AI ekstrak)',
        'Transaksi unlimited',
        '1 Google Sheet pribadi',
        'Ringkasan bulanan',
        'Kategori otomatis',
      ],
      isActive: true,
      isPopular: true,
      sortOrder: 0,
    },
  });
  logger.info({ packageId: pkg.id }, 'Default package seeded');
  return pkg;
}

module.exports = {
  listPackages,
  listActivePackages,
  getPackageById,
  getPackageBySlug,
  createPackage,
  updatePackage,
  deletePackage,
  togglePackage,
  seedDefaults,
};
