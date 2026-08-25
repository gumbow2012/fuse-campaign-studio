CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION citext SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;