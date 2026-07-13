-- AlterTable: tambahkan kolom isFreeTrial dan trialDays ke tabel Package
ALTER TABLE "Package" ADD COLUMN "isFreeTrial" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Package" ADD COLUMN "trialDays" INTEGER NOT NULL DEFAULT 0;

-- Seed: masukkan paket Free Trial (price = 0, trialDays = 3)
INSERT INTO "Package" ("id", "slug", "name", "description", "price", "durationDays", "features", "isActive", "isPopular", "isFreeTrial", "trialDays", "sortOrder", "createdAt", "updatedAt")
VALUES (
  'free_trial_default',
  'free-trial',
  'Free Trial',
  'Coba YorFinance gratis selama 3 hari — tanpa kartu kredit.',
  0,
  3,
  ARRAY['Semua fitur Basic', 'Tanpa kartu kredit', 'Kode aktivasi via email'],
  true,
  false,
  true,
  3,
  -1,
  NOW(),
  NOW()
)
ON CONFLICT ("slug") DO UPDATE SET
  "isFreeTrial" = true,
  "trialDays" = 3,
  "price" = 0;
