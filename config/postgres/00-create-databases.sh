#!/usr/bin/env bash
set -euo pipefail

create_role_and_database() {
  local role="$1"
  local password="$2"
  local database="$3"
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 \
    --set=role_name="$role" --set=role_password="$password" --set=database_name="$database" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role_name', :'role_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role_name')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database_name', :'role_name')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'database_name')
\gexec
SQL
}

create_role_and_database keycloak "${KEYCLOAK_DB_PASSWORD:?KEYCLOAK_DB_PASSWORD is required}" keycloak
create_role_and_database temporal "${TEMPORAL_DB_PASSWORD:?TEMPORAL_DB_PASSWORD is required}" temporal
create_role_and_database temporal "${TEMPORAL_DB_PASSWORD:?TEMPORAL_DB_PASSWORD is required}" temporal_visibility
create_role_and_database chatwoot "${CHATWOOT_DB_PASSWORD:?CHATWOOT_DB_PASSWORD is required}" chatwoot
create_role_and_database permify "${PERMIFY_DB_PASSWORD:?PERMIFY_DB_PASSWORD is required}" permify
