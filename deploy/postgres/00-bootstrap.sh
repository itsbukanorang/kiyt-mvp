#!/usr/bin/env bash
set -Eeuo pipefail
set +x

: "${POSTGRES_USER:?}"
: "${POSTGRES_DB:?}"
: "${KIYT_DB_APP_USER:?}"
: "${KIYT_DB_APP_PASSWORD:?}"
: "${KIYT_DB_NAME:?}"

psql \
  -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_user="$KIYT_DB_APP_USER" \
  --set=app_password="$KIYT_DB_APP_PASSWORD" \
  --set=app_db="$KIYT_DB_NAME" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
  :'app_user',
  :'app_password'
)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_roles
  WHERE rolname = :'app_user'
)
\gexec

SELECT format(
  'CREATE DATABASE %I OWNER %I',
  :'app_db',
  :'app_user'
)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_database
  WHERE datname = :'app_db'
)
\gexec
SQL

psql \
  -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$KIYT_DB_NAME" \
  --set=app_user="$KIYT_DB_APP_USER" <<'SQL'
ALTER SCHEMA public OWNER TO :"app_user";
GRANT ALL ON SCHEMA public TO :"app_user";
SQL
