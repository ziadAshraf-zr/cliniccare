-- ClinicCare — manual_constraints
-- القيود المتقدمة التي لا يُعبّر عنها Prisma تصريحيًا (القسم 4 و15 من الخطة
-- التقنية): Exclusion constraints، Trigger منع تعديل الزيارة الموقعة،
-- REVOKE على جدول التدقيق، فهارس بتعبير دالة/pg_trgm، وView البوابة.
-- تُطبَّق هذه الـ migration دائمًا بعد init_schema.

-- ===================== امتدادات =====================
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- Exclusion constraints على UUID + range
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- بحث تقريبي عن اسم المريض (كشف التكرار)

-- ===================== منع تعارض المواعيد =====================
-- النطاق [) يسمح بموعد ينتهي 10:30 وآخر يبدأ 10:30 دون تعارض.
-- الإلغاء وعدم الحضور مستثنيان: يحرران وقت الطبيب تلقائيًا.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_valid_range" CHECK ("end_at" > "start_at");

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "practitioner_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" NOT IN ('CANCELLED', 'NO_SHOW'));

-- ===================== إجازات الطبيب (time_off) =====================
ALTER TABLE "time_off"
  ADD CONSTRAINT "time_off_no_overlap"
  EXCLUDE USING gist (
    "practitioner_id" WITH =,
    "range" WITH &&
  );

-- ===================== ساعات العمل =====================
ALTER TABLE "working_hours"
  ADD CONSTRAINT "working_hours_valid_range" CHECK ("end_time" > "start_time");

-- ===================== حماية السجل الموقع (Encounter immutability) =====================
-- يرفض أي UPDATE على الحقول السريرية بعد status = SIGNED، ويسمح فقط بإضافة
-- صف في encounter_amendments. بهذا يفشل أي كود يتجاوز الـ Service بالخطأ
-- (القسم 4 و7.3 من الخطة التقنية).
CREATE FUNCTION forbid_signed_encounter_update() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'SIGNED' AND (
       NEW.chief_complaint IS DISTINCT FROM OLD.chief_complaint
    OR NEW.history        IS DISTINCT FROM OLD.history
    OR NEW.examination    IS DISTINCT FROM OLD.examination
    OR NEW.assessment     IS DISTINCT FROM OLD.assessment
    OR NEW.plan           IS DISTINCT FROM OLD.plan
  ) THEN
    RAISE EXCEPTION 'signed encounter is immutable; add an amendment instead'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER encounters_immutable_after_sign
  BEFORE UPDATE ON "encounters"
  FOR EACH ROW EXECUTE FUNCTION forbid_signed_encounter_update();

-- ===================== فهرس بحث المرضى =====================
-- يدعم البحث التقريبي عن الاسم (كشف التكرار، القسم 4).
CREATE INDEX "patients_full_name_trgm_idx" ON "patients" USING gin ("full_name" gin_trgm_ops);

-- فهرس فريد على lower(email) داخل نفس العيادة (UNIQUE(clinic_id, lower(email))).
CREATE UNIQUE INDEX "users_clinic_email_ci_key" ON "users" ("clinic_id", lower("email"));

-- ===================== جدول التدقيق: إضافة فقط =====================
-- مستخدم التطبيق (cliniccare_app) يملك INSERT/SELECT فقط، ولا يملك
-- UPDATE ولا DELETE على audit_events، حتى لو كان الكود نفسه مصابًا بخطأ.
-- ملحوظة: يفترض هذا أن مستخدم التطبيق ليس مالك الجداول (القسم 13: الأدوار).
REVOKE UPDATE, DELETE ON "audit_events" FROM cliniccare_app;
GRANT SELECT, INSERT ON "audit_events" TO cliniccare_app;

-- ===================== View البوابة (القسم 7.4) =====================
-- الـ Repository الخاص بالبوابة يقرأ من هذا الـ View فقط، لا من جدول
-- documents مباشرة، فلا يستطيع خطأ في الكود تسريب مسودة.
CREATE VIEW "portal_visible_documents" AS
  SELECT *
  FROM "documents"
  WHERE "status" = 'PUBLISHED';
