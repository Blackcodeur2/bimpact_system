-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RiskCaseStatus" AS ENUM ('NEW', 'INVESTIGATING', 'ESCALATED', 'RESOLVED', 'FALSE_POSITIVE');

-- AlterTable
ALTER TABLE "course_modules" ADD COLUMN     "status" "CourseStatus" NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email" TEXT,
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_changed_at" TIMESTAMP(3),
ADD COLUMN     "password_hash" TEXT;

-- CreateTable
CREATE TABLE "member_notes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_cases" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "signal_type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "RiskCaseStatus" NOT NULL DEFAULT 'NEW',
    "assigned_to_id" UUID,
    "created_by_id" UUID NOT NULL,
    "resolution" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_case_events" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "from_status" "RiskCaseStatus",
    "to_status" "RiskCaseStatus",
    "note" TEXT,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_case_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_notes_user_id_created_at_idx" ON "member_notes"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "risk_cases_reference_key" ON "risk_cases"("reference");

-- CreateIndex
CREATE INDEX "risk_cases_status_created_at_idx" ON "risk_cases"("status", "created_at");

-- CreateIndex
CREATE INDEX "risk_cases_user_id_idx" ON "risk_cases"("user_id");

-- CreateIndex
CREATE INDEX "risk_case_events_case_id_created_at_idx" ON "risk_case_events"("case_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "member_notes" ADD CONSTRAINT "member_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_cases" ADD CONSTRAINT "risk_cases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_case_events" ADD CONSTRAINT "risk_case_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "risk_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Identifiant de connexion du back-office normalisé : l'unicité ne dépend pas de la casse.
ALTER TABLE users ADD CONSTRAINT users_email_lowercase CHECK (email IS NULL OR email = lower(email));
-- Un mot de passe n'existe que pour un compte back-office.
ALTER TABLE users ADD CONSTRAINT users_password_staff_only CHECK (password_hash IS NULL OR kind = 'STAFF');

-- Notes internes et chronologie des dossiers de risque : traces non modifiables.
CREATE TRIGGER member_notes_immutable BEFORE UPDATE OR DELETE ON member_notes FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER member_notes_no_truncate BEFORE TRUNCATE ON member_notes FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER risk_case_events_immutable BEFORE UPDATE OR DELETE ON risk_case_events FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER risk_case_events_no_truncate BEFORE TRUNCATE ON risk_case_events FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
