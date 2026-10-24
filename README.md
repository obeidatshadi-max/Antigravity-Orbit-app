# ORBIT by AntiGravity

A personal reflection journey: goal → real situation → possible pattern → chosen action → weekly review. The report separates user inputs, activity counts and AI interpretations. It is a development tool, not a validated psychometric or clinical assessment.

Requires Node 20 or later. Run `npm test` and `npm run build`. No package installation is needed for the static build or unit tests.

Only allowlisted site assets are copied to `public/`, the Netlify publish directory. Database migrations, source functions, tests and instructions stay outside that directory. `.netlify/` contains local linking state and is ignored by Git.

Existing Supabase authentication protects registered-account records with row-level security. `supabase/migrations/20261024_orbit_account_storage.sql` adds the five report-storage tables and was applied to the Antigravity project on 24 October 2026. Do not reapply the initial schema to an existing project.

The AI function reads `ANTHROPIC_API_KEY` from Netlify function environment variables. Never put a provider secret in the browser or a committed environment file. Public Supabase client configuration is protected by database policies.

Example workspaces remain local. Registered-account report records sync per record; failures remain visibly pending in an account-scoped browser queue. Export and deletion apply to supplemental report records, leaving original situations, language reflections and the login account intact.

Unit tests cover account sync, migration, retries and ownership boundaries. Fixture browser tests and separate real database RLS checks were completed during release preparation; they do not establish scientific validity or replace production sign-in checks.
