#!/bin/sh
# ينشئ دور التطبيق محدود الصلاحيات عند أول تشغيل للحاوية فقط (القسم 13).
# يعمل هذا السكربت تلقائيًا عبر docker-entrypoint-initdb.d، وله صلاحية الوصول
# لمتغيرات البيئة التي تمررها docker-compose (DB_APP_PASSWORD).
set -eu

APP_PASSWORD="${DB_APP_PASSWORD:-change_me_app}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cliniccare_app') THEN
      CREATE ROLE cliniccare_app WITH LOGIN PASSWORD '${APP_PASSWORD}';
    END IF;
  END \$\$;

  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO cliniccare_app;
  GRANT USAGE ON SCHEMA public TO cliniccare_app;
EOSQL

echo "دور cliniccare_app جاهز."
