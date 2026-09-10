-- CreateEnum
CREATE TYPE "DrawStatus" AS ENUM ('DRAFT', 'FROZEN', 'EXECUTED', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BeneficiaryStatus" AS ENUM ('SELECTED', 'TRAINING', 'CERTIFIED', 'ENTREPRENEUR', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "draws" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "winner_count" INTEGER NOT NULL,
    "min_paid_days" INTEGER NOT NULL,
    "window_days" INTEGER NOT NULL,
    "status" "DrawStatus" NOT NULL DEFAULT 'DRAFT',
    "algorithm_version" TEXT NOT NULL DEFAULT 'sha256-rank-v1',
    "snapshot_at" TIMESTAMP(3),
    "eligible_count" INTEGER,
    "snapshot_hash" TEXT,
    "seed_commitment" TEXT,
    "seed" TEXT,
    "result_hash" TEXT,
    "executed_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "frozen_by_id" UUID,
    "executed_by_id" UUID,
    "published_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draw_entries" (
    "id" UUID NOT NULL,
    "draw_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "participant_token" TEXT NOT NULL,
    "paid_days" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draw_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draw_winners" (
    "id" UUID NOT NULL,
    "draw_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draw_winners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiaries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "draw_id" UUID NOT NULL,
    "status" "BeneficiaryStatus" NOT NULL DEFAULT 'SELECTED',
    "mentor_name" TEXT,
    "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "draws_code_key" ON "draws"("code");

-- CreateIndex
CREATE INDEX "draws_status_scheduled_at_idx" ON "draws"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "draw_entries_draw_id_user_id_key" ON "draw_entries"("draw_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "draw_entries_draw_id_participant_token_key" ON "draw_entries"("draw_id", "participant_token");

-- CreateIndex
CREATE UNIQUE INDEX "draw_winners_entry_id_key" ON "draw_winners"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "draw_winners_draw_id_rank_key" ON "draw_winners"("draw_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "beneficiaries_user_id_key" ON "beneficiaries"("user_id");

-- CreateIndex
CREATE INDEX "beneficiaries_status_idx" ON "beneficiaries"("status");

-- AddForeignKey
ALTER TABLE "draw_entries" ADD CONSTRAINT "draw_entries_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_entries" ADD CONSTRAINT "draw_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_winners" ADD CONSTRAINT "draw_winners_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_winners" ADD CONSTRAINT "draw_winners_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "draw_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Participants et gagnants d'un tirage : traces d'audit, ni modification ni suppression.
CREATE TRIGGER draw_entries_immutable BEFORE UPDATE OR DELETE ON draw_entries FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER draw_entries_no_truncate BEFORE TRUNCATE ON draw_entries FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER draw_winners_immutable BEFORE UPDATE OR DELETE ON draw_winners FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER draw_winners_no_truncate BEFORE TRUNCATE ON draw_winners FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();