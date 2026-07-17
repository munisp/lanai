#!/bin/bash
# Creates multiple databases in a single PostgreSQL instance
# Used by docker-compose to initialize all service databases
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- Create databases for each service that needs its own DB
  -- (keycloak, chatwoot, and temporal need separate databases)
  SELECT 'CREATE DATABASE keycloak' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec
  SELECT 'CREATE DATABASE chatwoot' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'chatwoot')\gexec
  SELECT 'CREATE DATABASE temporal' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'temporal')\gexec
  SELECT 'CREATE DATABASE temporal_visibility' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'temporal_visibility')\gexec

  -- Grant all privileges to the lanai user
  GRANT ALL PRIVILEGES ON DATABASE keycloak TO $POSTGRES_USER;
  GRANT ALL PRIVILEGES ON DATABASE chatwoot TO $POSTGRES_USER;
  GRANT ALL PRIVILEGES ON DATABASE temporal TO $POSTGRES_USER;
  GRANT ALL PRIVILEGES ON DATABASE temporal_visibility TO $POSTGRES_USER;
EOSQL

echo "Multiple databases created successfully."
