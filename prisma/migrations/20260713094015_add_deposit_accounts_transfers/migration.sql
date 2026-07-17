-- CreateTable
CREATE TABLE "deposit_accounts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'savings',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "balance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "deposit_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_transactions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "depositAccountId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "balanceAfter" DECIMAL(18,4) NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "transferId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "fromAccountId" UUID NOT NULL,
    "toAccountId" UUID NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "reference" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deposit_accounts_accountNumber_key" ON "deposit_accounts"("accountNumber");

-- CreateIndex
CREATE INDEX "deposit_accounts_tenantId_idx" ON "deposit_accounts"("tenantId");

-- CreateIndex
CREATE INDEX "deposit_accounts_tenantId_customerId_idx" ON "deposit_accounts"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "deposit_accounts_tenantId_status_idx" ON "deposit_accounts"("tenantId", "status");

-- CreateIndex
CREATE INDEX "deposit_transactions_tenantId_depositAccountId_idx" ON "deposit_transactions"("tenantId", "depositAccountId");

-- CreateIndex
CREATE INDEX "deposit_transactions_tenantId_date_idx" ON "deposit_transactions"("tenantId", "date");

-- CreateIndex
CREATE INDEX "transfers_tenantId_idx" ON "transfers"("tenantId");

-- CreateIndex
CREATE INDEX "transfers_tenantId_fromAccountId_idx" ON "transfers"("tenantId", "fromAccountId");

-- CreateIndex
CREATE INDEX "transfers_tenantId_toAccountId_idx" ON "transfers"("tenantId", "toAccountId");

-- AddForeignKey
ALTER TABLE "deposit_accounts" ADD CONSTRAINT "deposit_accounts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_depositAccountId_fkey" FOREIGN KEY ("depositAccountId") REFERENCES "deposit_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "deposit_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "deposit_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
