-- Runs once on first start of the db service, as POSTGRES_USER against POSTGRES_DB.
--
-- The postgis image already creates the `wps` superuser/database and enables the
-- postgis extension, so this only adds the read-only role. Mirrors the grants in
-- docs/MANUAL_SETUP.md ("Running the database locally").
CREATE USER wpsread;
ALTER USER wpsread WITH LOGIN;

GRANT CONNECT ON DATABASE wps TO wpsread;
GRANT USAGE ON SCHEMA public TO wpsread;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO wpsread;

-- Tables created later by alembic should be readable too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO wpsread;
