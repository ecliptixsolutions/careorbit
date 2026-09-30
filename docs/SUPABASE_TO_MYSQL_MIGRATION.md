# CareOrbit Supabase to MySQL migration

`DATABASE_SCHEMA_MIGRATION = ALREADY_COMPLETE` only after `npm run db:inspect` verifies the live database. The existing 20-table CareOrbit schema is preserved; it is never imported automatically.

`APPLICATION_MIGRATION = PARTIAL`: a Hostinger Node API uses server-only MySQL credentials, parameterized SQL, HTTP-only sessions and bcrypt password hashes. Configure `.env.example` in Hostinger, verify the database, then review/run the safe authentication forward migration once. Do not deploy the MySQL API to Cloudflare Workers.

The live DB was not verified here because no `MYSQL_*` credentials exist locally. No destructive SQL was run.
