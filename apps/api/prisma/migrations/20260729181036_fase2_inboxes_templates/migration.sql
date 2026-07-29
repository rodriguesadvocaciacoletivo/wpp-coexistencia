-- CreateEnum
CREATE TYPE "InboxOnboardingType" AS ENUM ('manual', 'coexistence');

-- CreateEnum
CREATE TYPE "InboxConnectionStatus" AS ENUM ('pending', 'connected', 'error');

-- CreateEnum
CREATE TYPE "InboxTokenType" AS ENUM ('system_user', 'business');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('UTILITY', 'MARKETING', 'AUTHENTICATION');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL', 'PENDING_DELETION', 'DELETED', 'LIMIT_EXCEEDED');

-- CreateTable
CREATE TABLE "inboxes" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone_number" VARCHAR(32) NOT NULL,
    "phone_number_id" VARCHAR(64) NOT NULL,
    "waba_id" VARCHAR(64) NOT NULL,
    "token_encrypted" TEXT NOT NULL,
    "token_type" "InboxTokenType" NOT NULL DEFAULT 'system_user',
    "onboarding_type" "InboxOnboardingType" NOT NULL DEFAULT 'manual',
    "connection_status" "InboxConnectionStatus" NOT NULL DEFAULT 'pending',
    "connection_error" TEXT,
    "last_validated_at" TIMESTAMP(3),
    "throughput_limit_mps" INTEGER NOT NULL DEFAULT 80,
    "coexistence_synced_at" TIMESTAMP(3),
    "verified_name" VARCHAR(160),
    "quality_rating" VARCHAR(24),
    "messaging_tier" VARCHAR(48),
    "waba_name" VARCHAR(160),
    "waba_review_status" VARCHAR(48),
    "webhook_subscribed_at" TIMESTAMP(3),
    "templates_synced_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_members" (
    "inbox_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_members_pkey" PRIMARY KEY ("inbox_id","user_id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "inbox_id" UUID NOT NULL,
    "meta_id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(512) NOT NULL,
    "language" VARCHAR(16) NOT NULL,
    "category" "TemplateCategory" NOT NULL,
    "status" "TemplateStatus" NOT NULL,
    "components" JSONB NOT NULL,
    "rejected_reason" VARCHAR(255),
    "quality_score" VARCHAR(24),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inboxes_phone_number_id_key" ON "inboxes"("phone_number_id");

-- CreateIndex
CREATE INDEX "inboxes_connection_status_idx" ON "inboxes"("connection_status");

-- CreateIndex
CREATE INDEX "inboxes_deleted_at_idx" ON "inboxes"("deleted_at");

-- CreateIndex
CREATE INDEX "inbox_members_user_id_idx" ON "inbox_members"("user_id");

-- CreateIndex
CREATE INDEX "templates_inbox_id_status_idx" ON "templates"("inbox_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "templates_inbox_id_name_language_key" ON "templates"("inbox_id", "name", "language");

-- AddForeignKey
ALTER TABLE "inbox_members" ADD CONSTRAINT "inbox_members_inbox_id_fkey" FOREIGN KEY ("inbox_id") REFERENCES "inboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_members" ADD CONSTRAINT "inbox_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_inbox_id_fkey" FOREIGN KEY ("inbox_id") REFERENCES "inboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
