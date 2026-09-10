-- CreateEnum
CREATE TYPE "ContributionPlanStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "ContributionSource" AS ENUM ('MANUAL', 'AUTO');

-- CreateTable
CREATE TABLE "contribution_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XAF',
    "frequency" TEXT NOT NULL DEFAULT 'DAILY',
    "auto_debit" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContributionPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_on" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contribution_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "period_date" DATE NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "source" "ContributionSource" NOT NULL,
    "ledger_transaction_id" UUID NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contribution_runs" (
    "id" UUID NOT NULL,
    "period_date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "processed" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contribution_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contribution_plans_user_id_key" ON "contribution_plans"("user_id");

-- CreateIndex
CREATE INDEX "contribution_plans_status_auto_debit_idx" ON "contribution_plans"("status", "auto_debit");

-- CreateIndex
CREATE UNIQUE INDEX "contributions_ledger_transaction_id_key" ON "contributions"("ledger_transaction_id");

-- CreateIndex
CREATE INDEX "contributions_period_date_idx" ON "contributions"("period_date");

-- CreateIndex
CREATE UNIQUE INDEX "contributions_user_id_period_date_key" ON "contributions"("user_id", "period_date");

-- CreateIndex
CREATE UNIQUE INDEX "contribution_runs_period_date_kind_key" ON "contribution_runs"("period_date", "kind");

-- AddForeignKey
ALTER TABLE "contribution_plans" ADD CONSTRAINT "contribution_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "contribution_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Une contribution payée est une trace financière : ni modification ni suppression.
CREATE TRIGGER contributions_immutable
  BEFORE UPDATE OR DELETE ON contributions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER contributions_no_truncate
  BEFORE TRUNCATE ON contributions
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();