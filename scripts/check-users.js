// Diagnostik: tampilkan semua user + subscription yang tersimpan di DB.
// Jalankan: node scripts/check-users.js
require('dotenv').config();
const { prisma } = require('../src/db/prisma');

(async () => {
  const users = await prisma.user.findMany({ include: { subscription: true } });
  if (users.length === 0) {
    console.log('DB kosong: belum ada user terdaftar.');
  } else {
    for (const u of users) {
      console.log({
        chatId: u.chatId || '(belum diredeem)',
        email: u.email,
        name: u.name,
        dashboardToken: u.dashboardToken ? '(ada)' : '(belum ada)',
        redeemCode: u.subscription?.redeemCode,
        subStatus: u.subscription?.status,
        activatedAt: u.subscription?.activatedAt,
        expiresAt: u.subscription?.expiresAt,
      });
    }
  }
  await prisma.$disconnect();
})();
