# ClinicCare

نظام تجريبي لإدارة عيادة (EHR صغير) — **مشروع تخرّج**. جميع البيانات داخل
النظام، بما فيها حسابات العرض التوضيحي، **اصطناعية بالكامل** ولا تمثّل أي
مريض حقيقي.

الخطة التقنية التفصيلية الكاملة (المعمارية، الصلاحيات، قاعدة البيانات،
الأمان، i18n، FHIR...) موثّقة هنا:
<https://claude.ai/artifact/G9iks7NxdhQRnuvRFzcDE1>

## المعمارية (باختصار)

**Modular Monolith**: واجهة Next.js ← خادم NestJS (11 Module منطقي) ←
PostgreSQL 16 + MinIO (متوافق مع S3) + MailHog.

```
apps/
  api/      خادم NestJS (Auth, AccessControl, Clinic, Patient, Scheduling,
            Clinical, Document, Portal, ConsentAudit, Interop, Notification)
  web/      واجهة Next.js (App Router)، عربي/إنجليزي RTL/LTR عبر next-intl
packages/
  shared/   Enums + صلاحيات + Zod schemas مشتركة بين الواجهة والخادم
prisma/     schema.prisma + migrations (مكتوبة يدويًا بـ SQL) + seed
infra/      docker-compose (Postgres, MinIO, MailHog) + سكربتات التهيئة
e2e/        اختبارات شاملة (لاحقًا)
```

## المتطلبات

- Node.js 22+ (راجع `.nvmrc`)
- pnpm 10 (`corepack enable && corepack prepare pnpm@10.28.0 --activate`)
- Docker (لتشغيل Postgres/MinIO/MailHog محليًا) — أو قاعدة Postgres 16 محلية
  مع امتداد `btree_gist` و`pg_trgm`.

## التشغيل محليًا

```bash
cp .env.example .env
# عدّل القيم في .env (كلمات السر، أسرار الجلسة...) — لا ترفع .env أبدًا.

pnpm install

# تشغيل Postgres + MinIO + MailHog
docker compose -f infra/docker-compose.yml up -d

# توليد Prisma Client (يحتاج اتصال إنترنت طبيعي أول مرة فقط، لتحميل
# محرّكات Prisma الثنائية من binaries.prisma.sh)
pnpm gen:prisma

# تطبيق الـ migrations (مكتوبة يدويًا لتغطية EXCLUDE constraints وTriggers
# وREVOKE وViews التي لا يُعبَّر عنها بصيغة Prisma التصريحية مباشرة)
pnpm db:migrate

# توليد بيانات تجريبية اصطناعية (مرضى، مواعيد، حسابات...)
pnpm db:seed

# تشغيل الواجهة والخادم معًا
pnpm dev
```

- الواجهة: <http://localhost:3000> (تحويل تلقائي إلى `/ar`)
- الخادم: <http://localhost:4000> — فحص الصحة على `/health/live` و`/health/ready`

> **ملاحظة:** أمر `pnpm gen:prisma` (`prisma generate`) يحتاج تحميل محرّك
> Prisma الثنائي المناسب لنظام التشغيل من `binaries.prisma.sh` **مرة واحدة
> فقط**. في أي بيئة إنترنت عادية (جهازك، GitHub Actions) هذا يعمل تلقائيًا
> دون أي تدخّل.

## التحقق (نفس ما تُشغّله CI)

```bash
pnpm typecheck   # tsc --noEmit على كل Package
pnpm lint        # eslint على كل Package (Flat Config، ESLint 9+)
pnpm build       # بناء packages/shared ثم apps/api (nest build) وapps/web (next build)
pnpm test        # اختبارات الوحدة (حاليًا: apps/api)
```

## حالة التنفيذ الحالية

- ✅ الهيكل الأساسي للـ Monorepo (pnpm workspaces) وCI (GitHub Actions:
  lint/typecheck/test/build/gitleaks/pnpm audit).
- ✅ `prisma/schema.prisma` الكامل (15 enum + 27 model) وmigrations محقَّقة
  فعليًا ضد PostgreSQL حقيقية: قيد منع تعارض المواعيد (`EXCLUDE ... USING
  gist`)، Trigger عدم قابلية تعديل السجلّ الموقَّع، REVOKE على جدول
  التدقيق (Append-only)، وView عرض المستندات للمريض.
- ✅ سكربت `seed` ببيانات اصطناعية (مرضى، أدوية، ICD-10، حسابات عرض).
- ✅ هيكل خادم NestJS: Prisma Module، معالج أخطاء موحّد، تسجيل JSON
  (`nestjs-pino`) مع إخفاء الحقول الحساسة، `/health`، و11 Module فارغ
  مُعلَّق عليه بالأسبوع الذي سيُنفَّذ فيه كل واحد منها.
- ✅ هيكل واجهة Next.js: توجيه `[locale]` (next-intl)، RTL/LTR تلقائي،
  Tailwind بخصائص منطقية (`ms-`/`me-`/`ps-`/`pe-`)، صفحة رئيسية، نموذج
  تسجيل دخول (واجهة فقط حتى يكتمل Auth Module)، وصفحات مبدئية للأقسام
  الأربعة (استقبال/طبيب/بوابة مريض/إدارة).
- ⏳ **القادم**: تنفيذ Auth Module فعليًا (جلسات + Argon2id + CSRF)، ثم
  AccessControl (الصلاحيات + الأدوار)، ثم باقي الـ Modules بالترتيب الوارد
  في الخطة التقنية.

## تنبيه أمني

بيانات العرض التوضيحي (حسابات، كلمات سر تجريبية، أرقام هواتف) **اصطناعية
بالكامل** ومولَّدة بـ Faker. لا تُدخِل أي بيانات حقيقية لمريض في أي بيئة من
بيئات هذا المشروع.
