-- CreateEnum
CREATE TYPE "LessonContentType" AS ENUM ('AUDIO', 'TEXT', 'VIDEO');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'FUNDED', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProjectDecision" AS ENUM ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "AccidentSeverity" AS ENUM ('LIGHT', 'MODERATE', 'SEVERE');

-- CreateEnum
CREATE TYPE "AccidentClaimStatus" AS ENUM ('SUBMITTED', 'DOCUMENTS_PENDING', 'INVESTIGATING', 'APPROVED', 'REJECTED', 'DISBURSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccidentDocType" AS ENUM ('BULLETIN_ENTREE', 'ORDONNANCE', 'FACTURE_HOPITAL', 'CONSTAT_POLICE', 'PHOTO_MOTO', 'AUTRE');

-- CreateEnum
CREATE TYPE "SolidarityMembershipStatus" AS ENUM ('ACTIVE', 'LEFT');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "JobApplicationStatus" AS ENUM ('PENDING', 'SHORTLISTED', 'CONTACTED', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "course_modules" (
    "id" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 120,
    "order" INTEGER NOT NULL DEFAULT 1,
    "icon_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_lessons" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "duration_minutes" INTEGER NOT NULL DEFAULT 15,
    "content_type" "LessonContentType" NOT NULL DEFAULT 'AUDIO',
    "audio_url" TEXT,
    "markdown_content" TEXT NOT NULL,
    "key_points" JSONB,
    "order" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_lesson_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "position_seconds" INTEGER NOT NULL DEFAULT 0,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "pass_score" INTEGER NOT NULL DEFAULT 70,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correct_index" INTEGER NOT NULL,
    "explanation" TEXT,
    "order" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_submissions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "answers" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "certificate_number" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Certificat de formation entrepreneuriale BENSKIN IMPACT',
    "holder_name" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verification_code" TEXT NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revocation_reason" TEXT,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "sector" TEXT,
    "city" TEXT,
    "location_detail" TEXT,
    "problem" TEXT,
    "solution" TEXT,
    "market" TEXT,
    "description" TEXT,
    "estimated_budget" DECIMAL(20,2),
    "personal_contribution" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "grant_requested" DECIMAL(20,2),
    "budget_lines" JSONB,
    "team_members" JSONB,
    "forecasts" JSONB,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "review_feedback" TEXT,
    "score" INTEGER,
    "submitted_at" TIMESTAMP(3),
    "reviewer_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_documents" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scan_status" TEXT NOT NULL DEFAULT 'NOT_SCANNED',
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_reviews" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "decision" "ProjectDecision" NOT NULL,
    "reason" TEXT NOT NULL,
    "score" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_milestones" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "target_date" TIMESTAMP(3),
    "amount" DECIMAL(20,2) NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_disbursements" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XAF',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ledger_transaction_id" UUID,
    "disbursed_at" TIMESTAMP(3),

    CONSTRAINT "project_disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accident_claims" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "severity" "AccidentSeverity" NOT NULL DEFAULT 'MODERATE',
    "third_party_involved" BOOLEAN NOT NULL DEFAULT false,
    "hospital_name" TEXT,
    "description" TEXT NOT NULL,
    "status" "AccidentClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "requested_amount" DECIMAL(20,2) NOT NULL,
    "approved_amount" DECIMAL(20,2),
    "disbursed_amount" DECIMAL(20,2),
    "review_notes" TEXT,
    "internal_notes" TEXT,
    "solidarity_eligible" BOOLEAN NOT NULL DEFAULT false,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "ledger_transaction_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accident_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_documents" (
    "id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "type" "AccidentDocType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scan_status" TEXT NOT NULL DEFAULT 'NOT_SCANNED',
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accident_claim_events" (
    "id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "AccidentClaimStatus",
    "message" TEXT,
    "actor_type" TEXT NOT NULL,
    "actor_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accident_claim_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solidarity_memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "SolidarityMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "rules_version" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solidarity_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "description" TEXT,
    "phone" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_members" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID,
    "full_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "company_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_offers" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "salary_hint" TEXT,
    "requirements" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "slots" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "closed_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "job_offer_id" UUID NOT NULL,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_messages" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "author_type" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "installation_id" TEXT,
    "name" TEXT NOT NULL,
    "properties" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_modules_month_key" ON "course_modules"("month");

-- CreateIndex
CREATE INDEX "course_lessons_module_id_order_idx" ON "course_lessons"("module_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "user_lesson_progress_user_id_lesson_id_key" ON "user_lesson_progress"("user_id", "lesson_id");

-- CreateIndex
CREATE INDEX "quiz_submissions_user_id_quiz_id_idx" ON "quiz_submissions"("user_id", "quiz_id");

-- CreateIndex
CREATE UNIQUE INDEX "certifications_certificate_number_key" ON "certifications"("certificate_number");

-- CreateIndex
CREATE UNIQUE INDEX "certifications_verification_code_key" ON "certifications"("verification_code");

-- CreateIndex
CREATE INDEX "certifications_user_id_idx" ON "certifications"("user_id");

-- CreateIndex
CREATE INDEX "projects_user_id_status_idx" ON "projects"("user_id", "status");

-- CreateIndex
CREATE INDEX "projects_status_submitted_at_idx" ON "projects"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_documents_storage_key_key" ON "project_documents"("storage_key");

-- CreateIndex
CREATE INDEX "project_documents_project_id_idx" ON "project_documents"("project_id");

-- CreateIndex
CREATE INDEX "project_reviews_project_id_created_at_idx" ON "project_reviews"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_disbursements_ledger_transaction_id_key" ON "project_disbursements"("ledger_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "accident_claims_reference_key" ON "accident_claims"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "accident_claims_ledger_transaction_id_key" ON "accident_claims"("ledger_transaction_id");

-- CreateIndex
CREATE INDEX "accident_claims_user_id_status_idx" ON "accident_claims"("user_id", "status");

-- CreateIndex
CREATE INDEX "accident_claims_status_created_at_idx" ON "accident_claims"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "claim_documents_storage_key_key" ON "claim_documents"("storage_key");

-- CreateIndex
CREATE INDEX "claim_documents_claim_id_idx" ON "claim_documents"("claim_id");

-- CreateIndex
CREATE INDEX "accident_claim_events_claim_id_created_at_idx" ON "accident_claim_events"("claim_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "solidarity_memberships_user_id_key" ON "solidarity_memberships"("user_id");

-- CreateIndex
CREATE INDEX "solidarity_memberships_status_joined_at_idx" ON "solidarity_memberships"("status", "joined_at");

-- CreateIndex
CREATE UNIQUE INDEX "companies_project_id_key" ON "companies"("project_id");

-- CreateIndex
CREATE INDEX "companies_owner_id_idx" ON "companies"("owner_id");

-- CreateIndex
CREATE INDEX "companies_status_idx" ON "companies"("status");

-- CreateIndex
CREATE INDEX "company_members_company_id_idx" ON "company_members"("company_id");

-- CreateIndex
CREATE INDEX "company_members_user_id_idx" ON "company_members"("user_id");

-- CreateIndex
CREATE INDEX "job_offers_is_active_created_at_idx" ON "job_offers"("is_active", "created_at");

-- CreateIndex
CREATE INDEX "job_offers_company_id_idx" ON "job_offers"("company_id");

-- CreateIndex
CREATE INDEX "job_applications_job_offer_id_status_idx" ON "job_applications"("job_offer_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_applications_user_id_job_offer_id_key" ON "job_applications"("user_id", "job_offer_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_reference_key" ON "support_tickets"("reference");

-- CreateIndex
CREATE INDEX "support_tickets_user_id_created_at_idx" ON "support_tickets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_status_last_message_at_idx" ON "support_tickets"("status", "last_message_at");

-- CreateIndex
CREATE INDEX "support_ticket_messages_ticket_id_created_at_idx" ON "support_ticket_messages"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "analytics_events_name_occurred_at_idx" ON "analytics_events"("name", "occurred_at");

-- AddForeignKey
ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_submissions" ADD CONSTRAINT "quiz_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_submissions" ADD CONSTRAINT "quiz_submissions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_reviews" ADD CONSTRAINT "project_reviews_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_disbursements" ADD CONSTRAINT "project_disbursements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accident_claims" ADD CONSTRAINT "accident_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_documents" ADD CONSTRAINT "claim_documents_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "accident_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accident_claim_events" ADD CONSTRAINT "accident_claim_events_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "accident_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solidarity_memberships" ADD CONSTRAINT "solidarity_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_job_offer_id_fkey" FOREIGN KEY ("job_offer_id") REFERENCES "job_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Traces non modifiables : chronologie des dossiers d'accident, décisions du comité projets, échanges support.
CREATE TRIGGER accident_claim_events_immutable BEFORE UPDATE OR DELETE ON accident_claim_events FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER accident_claim_events_no_truncate BEFORE TRUNCATE ON accident_claim_events FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER project_reviews_immutable BEFORE UPDATE OR DELETE ON project_reviews FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER project_reviews_no_truncate BEFORE TRUNCATE ON project_reviews FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER support_ticket_messages_immutable BEFORE UPDATE OR DELETE ON support_ticket_messages FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER support_ticket_messages_no_truncate BEFORE TRUNCATE ON support_ticket_messages FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- Montants cohérents même en cas d'accès SQL direct.
ALTER TABLE accident_claims
  ADD CONSTRAINT accident_claims_amounts_valid CHECK (
    requested_amount > 0
    AND (approved_amount IS NULL OR approved_amount > 0)
    AND (disbursed_amount IS NULL OR disbursed_amount >= 0)
    AND (disbursed_amount IS NULL OR approved_amount IS NULL OR disbursed_amount <= approved_amount)
  );
ALTER TABLE projects
  ADD CONSTRAINT projects_amounts_valid CHECK (
    personal_contribution >= 0
    AND (estimated_budget IS NULL OR estimated_budget > 0)
    AND (grant_requested IS NULL OR grant_requested >= 0)
  );
ALTER TABLE job_offers ADD CONSTRAINT job_offers_slots_positive CHECK (slots > 0);

-- Le fonds de solidarité est une dette envers les adhérents (passif), comme le fonds des contributions.
-- Correction du type créé à tort en actif, uniquement tant qu'aucune écriture n'existe sur ce compte.
UPDATE ledger_accounts
   SET type = 'LIABILITY', name = 'Fonds de solidarité (adhérents volontaires)'
 WHERE code = 'system:solidarity_pool'
   AND NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e.account_id = ledger_accounts.id);

