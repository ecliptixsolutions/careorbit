# CareOrbit authentication migration analysis

Authentication has deliberately not been migrated in Phase 2. The four application profile IDs are application records; they do not supply portable password hashes, refresh tokens, MFA factors, or provider identities for a safe MySQL authentication import.

The source admin endpoint reports four authentication users, and their IDs exactly match the four application profile IDs selected for the data migration. The read-only response did not expose password hashes and reported no enrolled MFA factors. This is evidence for identity correspondence, not a credential migration path.

No `auth_users` table was created and no production user was created, altered, deleted, or reset. Existing Supabase authentication remains authoritative until a separately approved authentication cutover is designed, including credential-reset, session invalidation, MFA, and rollback plans.
