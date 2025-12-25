-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE INDEX "categories_userId_idx" ON "categories"("userId");

-- CreateIndex
CREATE INDEX "credit_cards_userId_idx" ON "credit_cards"("userId");

-- CreateIndex
CREATE INDEX "credit_cards_accountId_idx" ON "credit_cards"("accountId");

-- CreateIndex
CREATE INDEX "transactions_userId_paid_idx" ON "transactions"("userId", "paid");

-- CreateIndex
CREATE INDEX "transactions_accountId_date_idx" ON "transactions"("accountId", "date");

-- CreateIndex
CREATE INDEX "transactions_creditCardId_paid_idx" ON "transactions"("creditCardId", "paid");

-- CreateIndex
CREATE INDEX "transactions_recurrenceId_idx" ON "transactions"("recurrenceId");

-- CreateIndex
CREATE INDEX "transfers_userId_idx" ON "transfers"("userId");

-- CreateIndex
CREATE INDEX "transfers_userId_date_idx" ON "transfers"("userId", "date");

-- CreateIndex
CREATE INDEX "transfers_fromAccountId_idx" ON "transfers"("fromAccountId");

-- CreateIndex
CREATE INDEX "transfers_fromAccountId_date_idx" ON "transfers"("fromAccountId", "date");

-- CreateIndex
CREATE INDEX "transfers_toAccountId_idx" ON "transfers"("toAccountId");

-- CreateIndex
CREATE INDEX "transfers_toAccountId_date_idx" ON "transfers"("toAccountId", "date");
