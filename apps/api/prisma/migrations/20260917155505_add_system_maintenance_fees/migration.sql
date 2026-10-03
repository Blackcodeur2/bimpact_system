-- CreateTable
CREATE TABLE "system_maintenance_fees" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XAF',
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ledger_transaction_id" UUID,
    "notes" TEXT,

    CONSTRAINT "system_maintenance_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_maintenance_fees_ledger_transaction_id_key" ON "system_maintenance_fees"("ledger_transaction_id");

-- CreateIndex
CREATE INDEX "system_maintenance_fees_month_idx" ON "system_maintenance_fees"("month");

-- CreateIndex
CREATE UNIQUE INDEX "system_maintenance_fees_user_id_month_key" ON "system_maintenance_fees"("user_id", "month");

-- AddForeignKey
ALTER TABLE "system_maintenance_fees" ADD CONSTRAINT "system_maintenance_fees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
