const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

async function connectDb() {
  await prisma.$connect();
  logger.info('Database terhubung (Prisma)');
}

async function disconnectDb() {
  await prisma.$disconnect();
}

module.exports = { prisma, connectDb, disconnectDb };
