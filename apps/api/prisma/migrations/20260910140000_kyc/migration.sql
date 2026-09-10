-- CreateEnum
CREATE TYPE "KycIdDocumentType" AS ENUM ('CNI', 'PASSPORT', 'RECEIPT');

-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('ID_FRONT', 'ID_BACK', 'SELFIE', 'VEHICLE_REGISTRATION', 'DRIVING_LICENSE');

-- CreateEnum
CREATE TYPE "KycDocumentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REPLACED');

-- CreateEnum
CREATE TYPE "KycReviewDecision" AS ENUM ('APPROVED', 'REJECTED', 'MORE_INFO_REQUESTED');

-- CreateEnum
CREATE TYPE "VehicleOwnership" AS ENUM ('OWNER', 'RENTED', 'THIRD_PARTY');

-- CreateTable
CREATE TABLE "kyc_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'DRAFT',
    "first_name" TEXT,
    "last_name" TEXT,
    "birth_date" DATE,
    "id_document_type" "KycIdDocumentType",
    "id_document_number" TEXT,
    "id_document_expiry" DATE,
    "city" TEXT,
    "district" TEXT,
    "address_hint" TEXT,
    "vehicle_plate" TEXT,
    "vehicle_model" TEXT,
    "vehicle_ownership" "VehicleOwnership",
    "submission_count" INTEGER NOT NULL DEFAULT 0,
    "submitted_at" TIMESTAMP(3),
    "reviewer_id" UUID,
    "review_started_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "last_decision_reason" TEXT,
    "risk_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider_name" TEXT,
    "provider_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" UUID NOT NULL,
    "kyc_profile_id" UUID NOT NULL,
    "type" "KycDocumentType" NOT NULL,
    "status" "KycDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scan_status" TEXT NOT NULL DEFAULT 'NOT_SCANNED',
    "rejection_reason" TEXT,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replaced_at" TIMESTAMP(3),

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_reviews" (
    "id" UUID NOT NULL,
    "kyc_profile_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "decision" "KycReviewDecision" NOT NULL,
    "reason" TEXT,
    "internal_notes" TEXT,
    "submission_number" INTEGER NOT NULL,
    "document_decisions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kyc_profiles_user_id_key" ON "kyc_profiles"("user_id");

-- CreateIndex
CREATE INDEX "kyc_profiles_status_submitted_at_idx" ON "kyc_profiles"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "kyc_profiles_id_document_number_idx" ON "kyc_profiles"("id_document_number");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_documents_storage_key_key" ON "kyc_documents"("storage_key");

-- CreateIndex
CREATE INDEX "kyc_documents_kyc_profile_id_type_idx" ON "kyc_documents"("kyc_profile_id", "type");

-- CreateIndex
CREATE INDEX "kyc_reviews_kyc_profile_id_created_at_idx" ON "kyc_reviews"("kyc_profile_id", "created_at");

-- AddForeignKey
ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_kyc_profile_id_fkey" FOREIGN KEY ("kyc_profile_id") REFERENCES "kyc_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_reviews" ADD CONSTRAINT "kyc_reviews_kyc_profile_id_fkey" FOREIGN KEY ("kyc_profile_id") REFERENCES "kyc_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Historique des décisions KYC immuable (fonction forbid_mutation créée par 20260910120100_ledger_integrity)
CREATE TRIGGER kyc_reviews_immutable
  BEFORE UPDATE OR DELETE ON kyc_reviews
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER kyc_reviews_no_truncate
  BEFORE TRUNCATE ON kyc_reviews
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();