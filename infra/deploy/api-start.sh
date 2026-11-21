#!/bin/sh
# سكربت تشغيل الـ API في بيئة النشر (Render + Postgres مُدار).
# الخطوات بالترتيب: تجهيز القاعدة (امتدادات + دور التطبيق المحدود) ← migrations ← seed
# اختياري لأول مرة فقط ← تشغيل الخادم. آمن للتشغيل المتكرر (idempotent).
set -eu

: "${MIGRATE_DATABASE_URL:?MIGRATE_DATABASE_URL مطلوب (رابط مالك القاعدة)}"
: "${DATABASE_URL:?DATABASE_URL مطلوب (رابط مستخدم cliniccare_app)}"
: "${DB_APP_PASSWORD:?DB_APP_PASSWORD مطلوب (نفس كلمة سر cliniccare_app في DATABASE_URL)}"

# كلمة السر تُدرج داخل SQL، فنقصرها على أحرف آمنة بدل الاعتماد على escaping.
case "$DB_APP_PASSWORD" in
  *[!A-Za-z0-9_]*) echo "DB_APP_PASSWORD يجب أن تحتوي أحرفًا وأرقامًا و _ فقط" >&2; exit 1 ;;
esac

cd /repo

echo "[deploy] تجهيز القاعدة (الامتدادات ودور التطبيق)..."
pnpm prisma db execute --url "$MIGRATE_DATABASE_URL" --stdin <<EOSQL
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cliniccare_app') THEN
    CREATE ROLE cliniccare_app WITH LOGIN PASSWORD '${DB_APP_PASSWORD}';
  ELSE
    ALTER ROLE cliniccare_app WITH LOGIN PASSWORD '${DB_APP_PASSWORD}';
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO cliniccare_app', current_database());
END
\$\$;

GRANT USAGE ON SCHEMA public TO cliniccare_app;

-- الجداول التي ستنشئها الـ migrations تمنح الصلاحيات الأساسية تلقائيًا للتطبيق.
-- أمر REVOKE داخل migration جدول التدقيق يسحب UPDATE/DELETE منه بعد ذلك.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cliniccare_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO cliniccare_app;
EOSQL

echo "[deploy] تطبيق الـ migrations..."
pnpm prisma migrate deploy

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  # يملأ البيانات الاصطناعية فقط إن كانت جداول المستخدمين فارغة.
  USERS=$(node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count().then(n=>{console.log(n);return p.\$disconnect()})")
  if [ "$USERS" = "0" ]; then
    echo "[deploy] القاعدة فارغة: تعبئة البيانات الاصطناعية..."
    DATABASE_URL="$MIGRATE_DATABASE_URL" pnpm exec tsx prisma/seed/index.ts
  else
    echo "[deploy] القاعدة فيها بيانات بالفعل: تخطّي الـ seed."
  fi
fi

echo "[deploy] تشغيل الـ API..."
exec node apps/api/dist/main.js
