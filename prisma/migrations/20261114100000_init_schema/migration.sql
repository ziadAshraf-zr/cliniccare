-- ClinicCare — init_schema
-- يطابق prisma/schema.prisma حرفيًا. القيود المتقدمة (Exclusion/Trigger/REVOKE/
-- الفهارس بتعبير دالة/Views) في الـ migration التالية (manual_constraints)
-- لأن Prisma لا يُعبّر عنها تصريحيًا (القسم 4 من الخطة التقنية).

-- امتداد توليد UUID على مستوى الخادم (gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===================== Enums =====================

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PATIENT');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN');
CREATE TYPE "AllergySeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE');
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "EncounterStatus" AS ENUM ('DRAFT', 'SIGNED', 'ENTERED_IN_ERROR');
CREATE TYPE "DiagnosisStatus" AS ENUM ('ACTIVE', 'RESOLVED');
CREATE TYPE "PrescriptionStatus" AS ENUM ('DRAFT', 'ISSUED');
CREATE TYPE "DocumentType" AS ENUM ('LAB_RESULT', 'IMAGING', 'REFERRAL', 'PRESCRIPTION', 'OTHER');
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETRACTED');
CREATE TYPE "ConsentPurpose" AS ENUM ('PORTAL_ACCESS', 'EMAIL_NOTIFICATIONS', 'DATA_EXPORT');
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN');
CREATE TYPE "ConsentMethod" AS ENUM ('PORTAL', 'IN_PERSON');
CREATE TYPE "NotificationType" AS ENUM ('APPOINTMENT_CONFIRMED', 'APPOINTMENT_REMINDER', 'APPOINTMENT_CANCELLED', 'PRESCRIPTION_ISSUED', 'DOCUMENT_PUBLISHED', 'PORTAL_INVITATION');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- ===================== مجموعة الهوية =====================

CREATE TABLE "clinics" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "name"           TEXT NOT NULL,
  "timezone"       TEXT NOT NULL DEFAULT 'Africa/Cairo',
  "default_locale" TEXT NOT NULL DEFAULT 'ar',
  "status"         TEXT NOT NULL DEFAULT 'ACTIVE',
  "is_demo"        BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinic_id"        UUID NOT NULL,
  "email"            TEXT NOT NULL,
  "password_hash"    TEXT NOT NULL,
  "status"           "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "failed_logins"    INTEGER NOT NULL DEFAULT 0,
  "locked_until"     TIMESTAMPTZ(3),
  "last_login_at"    TIMESTAMPTZ(3),
  "preferred_locale" TEXT NOT NULL DEFAULT 'ar',
  "notify_by_email"  BOOLEAN NOT NULL DEFAULT true,
  "is_demo"          BOOLEAN NOT NULL DEFAULT true,
  "created_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "users_clinic_id_idx" ON "users"("clinic_id");

CREATE TABLE "user_roles" (
  "user_id" UUID NOT NULL,
  "role"    "UserRole" NOT NULL,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id", "role")
);

CREATE TABLE "sessions" (
  "id"           VARCHAR(64) NOT NULL,
  "user_id"      UUID NOT NULL,
  "expires_at"   TIMESTAMPTZ(3) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "ip"           TEXT,
  "user_agent"   TEXT,
  "revoked_at"   TIMESTAMPTZ(3),
  "created_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

CREATE TABLE "patient_invitations" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "patient_id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "used_at"    TIMESTAMPTZ(3),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "patient_invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "patient_invitations_token_hash_key" ON "patient_invitations"("token_hash");

-- ===================== مجموعة العيادة =====================

CREATE TABLE "practitioners" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"              UUID NOT NULL,
  "specialty"            TEXT,
  "license_no"           TEXT,
  "default_slot_minutes" INTEGER NOT NULL DEFAULT 20,
  "created_at"           TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "practitioners_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "practitioners_user_id_key" ON "practitioners"("user_id");

CREATE TABLE "working_hours" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "practitioner_id" UUID NOT NULL,
  "weekday"         INTEGER NOT NULL,
  "start_time"      TIME(3) NOT NULL,
  "end_time"        TIME(3) NOT NULL,
  CONSTRAINT "working_hours_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "working_hours_practitioner_id_weekday_idx" ON "working_hours"("practitioner_id", "weekday");

CREATE TABLE "time_off" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "practitioner_id" UUID NOT NULL,
  "range"           TSTZRANGE NOT NULL,
  "reason"          TEXT,
  CONSTRAINT "time_off_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "time_off_practitioner_id_idx" ON "time_off"("practitioner_id");

CREATE TABLE "services" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinic_id"        UUID NOT NULL,
  "name_ar"          TEXT NOT NULL,
  "name_en"          TEXT NOT NULL,
  "duration_minutes" INTEGER NOT NULL,
  "price_cents"      INTEGER NOT NULL,
  "created_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "services_clinic_id_idx" ON "services"("clinic_id");

-- ===================== مجموعة المرضى =====================

CREATE TABLE "patients" (
  "id"                       UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinic_id"                UUID NOT NULL,
  "medical_record_no"        TEXT NOT NULL,
  "full_name"                TEXT NOT NULL,
  "dob"                      DATE NOT NULL,
  "sex"                      "Sex" NOT NULL,
  "phone_e164"               TEXT NOT NULL,
  "email"                    TEXT,
  "address"                  TEXT,
  "emergency_contact_name"   TEXT,
  "emergency_contact_phone"  TEXT,
  "is_demo"                  BOOLEAN NOT NULL DEFAULT true,
  "created_at"               TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at"               TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "patients_clinic_mrn_key" ON "patients"("clinic_id", "medical_record_no");
CREATE INDEX "patients_clinic_id_phone_e164_idx" ON "patients"("clinic_id", "phone_e164");

CREATE TABLE "patient_accounts" (
  "user_id"    UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "linked_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "patient_accounts_pkey" PRIMARY KEY ("user_id")
);
CREATE UNIQUE INDEX "patient_accounts_patient_id_key" ON "patient_accounts"("patient_id");

CREATE TABLE "allergies" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "patient_id"  UUID NOT NULL,
  "substance"   TEXT NOT NULL,
  "reaction"    TEXT,
  "severity"    "AllergySeverity" NOT NULL,
  "recorded_by" UUID NOT NULL,
  "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "allergies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "allergies_patient_id_idx" ON "allergies"("patient_id");

-- ===================== مجموعة المواعيد =====================

CREATE TABLE "appointments" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinic_id"        UUID NOT NULL,
  "patient_id"       UUID NOT NULL,
  "practitioner_id"  UUID NOT NULL,
  "service_id"       UUID NOT NULL,
  "start_at"         TIMESTAMPTZ(3) NOT NULL,
  "end_at"           TIMESTAMPTZ(3) NOT NULL,
  "status"           "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
  "cancel_reason"    TEXT,
  "checked_in_at"    TIMESTAMPTZ(3),
  "reminder_sent_at" TIMESTAMPTZ(3),
  "created_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "appointments_clinic_id_start_at_idx" ON "appointments"("clinic_id", "start_at");
CREATE INDEX "appointments_practitioner_id_start_at_idx" ON "appointments"("practitioner_id", "start_at");

-- ===================== مجموعة الزيارة =====================

CREATE TABLE "encounters" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinic_id"       UUID NOT NULL,
  "patient_id"      UUID NOT NULL,
  "practitioner_id" UUID NOT NULL,
  "appointment_id"  UUID,
  "status"          "EncounterStatus" NOT NULL DEFAULT 'DRAFT',
  "chief_complaint" TEXT,
  "history"         TEXT,
  "examination"     TEXT,
  "assessment"      TEXT,
  "plan"            TEXT,
  "version"         INTEGER NOT NULL DEFAULT 1,
  "signed_at"       TIMESTAMPTZ(3),
  "signed_by"       UUID,
  "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "encounters_appointment_id_key" ON "encounters"("appointment_id");
CREATE INDEX "encounters_patient_id_created_at_idx" ON "encounters"("patient_id", "created_at" DESC);

CREATE TABLE "encounter_amendments" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "encounter_id"  UUID NOT NULL,
  "amended_by"    UUID NOT NULL,
  "reason"        TEXT NOT NULL,
  "addendum_text" TEXT NOT NULL,
  "created_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "encounter_amendments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "encounter_amendments_encounter_id_idx" ON "encounter_amendments"("encounter_id");

CREATE TABLE "vitals" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "encounter_id"  UUID NOT NULL,
  "patient_id"    UUID NOT NULL,
  "code"          TEXT NOT NULL,
  "value_numeric" DECIMAL(8,2) NOT NULL,
  "unit"          TEXT NOT NULL,
  "measured_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "recorded_by"   UUID NOT NULL,
  CONSTRAINT "vitals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vitals_patient_id_idx" ON "vitals"("patient_id");

CREATE TABLE "diagnoses" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "encounter_id" UUID NOT NULL,
  "patient_id"   UUID NOT NULL,
  "icd10_code"   TEXT NOT NULL,
  "display_ar"   TEXT NOT NULL,
  "display_en"   TEXT NOT NULL,
  "status"       "DiagnosisStatus" NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "diagnoses_patient_id_idx" ON "diagnoses"("patient_id");

-- ===================== مجموعة الأدوية =====================

CREATE TABLE "medications_catalog" (
  "id"       UUID NOT NULL DEFAULT gen_random_uuid(),
  "name_ar"  TEXT NOT NULL,
  "name_en"  TEXT NOT NULL,
  "form"     TEXT NOT NULL,
  "strength" TEXT NOT NULL,
  CONSTRAINT "medications_catalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prescriptions" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "encounter_id"    UUID NOT NULL,
  "patient_id"      UUID NOT NULL,
  "status"          "PrescriptionStatus" NOT NULL DEFAULT 'DRAFT',
  "issued_at"       TIMESTAMPTZ(3),
  "pdf_document_id" UUID,
  CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "prescriptions_encounter_id_key" ON "prescriptions"("encounter_id");
CREATE UNIQUE INDEX "prescriptions_pdf_document_id_key" ON "prescriptions"("pdf_document_id");
CREATE INDEX "prescriptions_patient_id_idx" ON "prescriptions"("patient_id");

CREATE TABLE "prescription_items" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "prescription_id" UUID NOT NULL,
  "medication_id"   UUID NOT NULL,
  "dose_text"       TEXT NOT NULL,
  "route"           TEXT NOT NULL,
  "frequency"       TEXT NOT NULL,
  "duration_days"   INTEGER NOT NULL,
  "instructions"    TEXT,
  CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prescription_items_prescription_id_idx" ON "prescription_items"("prescription_id");

-- ===================== مجموعة المستندات =====================

CREATE TABLE "documents" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinic_id"    UUID NOT NULL,
  "patient_id"   UUID NOT NULL,
  "encounter_id" UUID,
  "type"         "DocumentType" NOT NULL,
  "title"        TEXT NOT NULL,
  "storage_key"  TEXT NOT NULL,
  "mime_type"    TEXT NOT NULL,
  "size_bytes"   INTEGER NOT NULL,
  "sha256"       TEXT NOT NULL,
  "status"       "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "published_at" TIMESTAMPTZ(3),
  "published_by" UUID,
  "is_demo"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");
CREATE INDEX "documents_patient_id_status_idx" ON "documents"("patient_id", "status");

-- ===================== مجموعة الموافقات والتدقيق =====================

CREATE TABLE "consent_texts" (
  "purpose" "ConsentPurpose" NOT NULL,
  "version" INTEGER NOT NULL,
  "body_ar" TEXT NOT NULL,
  "body_en" TEXT NOT NULL,
  CONSTRAINT "consent_texts_pkey" PRIMARY KEY ("purpose", "version")
);

CREATE TABLE "consents" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "patient_id"   UUID NOT NULL,
  "purpose"      "ConsentPurpose" NOT NULL,
  "text_version" INTEGER NOT NULL,
  "status"       "ConsentStatus" NOT NULL DEFAULT 'GRANTED',
  "captured_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "withdrawn_at" TIMESTAMPTZ(3),
  "method"       "ConsentMethod" NOT NULL,
  CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "consents_patient_id_purpose_idx" ON "consents"("patient_id", "purpose");

CREATE TABLE "audit_events" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinic_id"     UUID NOT NULL,
  "actor_id"      UUID,
  "actor_role"    TEXT,
  "action"        TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id"   UUID,
  "patient_id"    UUID,
  "outcome"       TEXT NOT NULL DEFAULT 'SUCCESS',
  "ip"            TEXT,
  "request_id"    TEXT,
  "occurred_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "metadata"      JSONB,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_events_clinic_id_occurred_at_idx" ON "audit_events"("clinic_id", "occurred_at");
CREATE INDEX "audit_events_patient_id_idx" ON "audit_events"("patient_id");
CREATE INDEX "audit_events_actor_id_idx" ON "audit_events"("actor_id");

-- ===================== مجموعة التشغيل =====================

CREATE TABLE "notifications" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    UUID NOT NULL,
  "type"       "NotificationType" NOT NULL,
  "payload"    JSONB NOT NULL,
  "read_at"    TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

CREATE TABLE "outbox" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "type"       TEXT NOT NULL,
  "payload"    JSONB NOT NULL,
  "status"     "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"   INTEGER NOT NULL DEFAULT 0,
  "run_at"     TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "outbox_status_run_at_idx" ON "outbox"("status", "run_at");

CREATE TABLE "clinic_counters" (
  "clinic_id"  UUID NOT NULL,
  "name"       TEXT NOT NULL,
  "next_value" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "clinic_counters_pkey" PRIMARY KEY ("clinic_id", "name")
);

-- ===================== المفاتيح الخارجية (Foreign Keys) =====================

ALTER TABLE "users" ADD CONSTRAINT "users_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_invitations" ADD CONSTRAINT "patient_invitations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_invitations" ADD CONSTRAINT "patient_invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "services" ADD CONSTRAINT "services_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "patients" ADD CONSTRAINT "patients_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_accounts" ADD CONSTRAINT "patient_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "patient_accounts" ADD CONSTRAINT "patient_accounts_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "allergies" ADD CONSTRAINT "allergies_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "encounters" ADD CONSTRAINT "encounters_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "encounter_amendments" ADD CONSTRAINT "encounter_amendments_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_pdf_document_id_fkey" FOREIGN KEY ("pdf_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_medication_id_fkey" FOREIGN KEY ("medication_id") REFERENCES "medications_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "documents" ADD CONSTRAINT "documents_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "consents" ADD CONSTRAINT "consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consents" ADD CONSTRAINT "consents_purpose_text_version_fkey" FOREIGN KEY ("purpose", "text_version") REFERENCES "consent_texts"("purpose", "version") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinic_counters" ADD CONSTRAINT "clinic_counters_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
