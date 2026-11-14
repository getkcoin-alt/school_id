-- Dropdown choices for custom ID card fields
ALTER TABLE "SchoolField" ADD COLUMN "options" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- New schools get three printing rounds by default
ALTER TABLE "School" ALTER COLUMN "studentRounds" SET DEFAULT 3;
ALTER TABLE "School" ALTER COLUMN "staffRounds" SET DEFAULT 3;

-- Order forms: the CtC form filled on screen, with the scanned copy optional
ALTER TABLE "OrderForm" ADD COLUMN "details" JSONB;
ALTER TABLE "OrderForm" ALTER COLUMN "fileName" DROP NOT NULL;
ALTER TABLE "OrderForm" ALTER COLUMN "storageKey" DROP NOT NULL;
ALTER TABLE "OrderForm" ALTER COLUMN "mime" DROP NOT NULL;
ALTER TABLE "OrderForm" ALTER COLUMN "size" DROP NOT NULL;
