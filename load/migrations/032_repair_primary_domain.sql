-- 032_repair_primary_domain: fix profiles.primary_domain.
--
-- TWO BUGS, ONE CAUSE. auth-server.js inserted a hardcoded 'web' into
-- primary_domain for every new signup, while the domains the member actually
-- picked only ever fed department_memberships. So selecting Blockchain at
-- signup produced a Web Development profile -- which is what the roadmap
-- resolves on. The register form was a second copy of the domain list and had
-- also drifted (no `embedded`), so that track could not be picked at all.
--
-- Evidence before this migration (16 profiles):
--   12 x 'web'          -- the hardcoded default
--    1 x 'Blockchain '  -- capitalised, trailing space; not a resolvable slug
--    2 x 'backend', 1 x 'devops'
--   and memberships that contradict the stored value:
--     Sourabh Singh   primary=web  depts=ai_ml
--     Shaurya Aswal   primary=web  depts=ai_ml
--     Aarav Aggarwal  primary=web  depts=ai_ml
--     Ankit Bisht     primary=web  depts=dsa
--
-- Repair rules, in priority order. Only rows that are DEMONSTRABLY wrong are
-- touched; a member who genuinely chose web, or who has no memberships to
-- infer from, is left exactly as they are.
--
--   1. Invalid slug (not in PRIMARY_DOMAINS, case/space variants included)
--      -> repaired from membership.
--   2. primary_domain = 'web' AND the member belongs to some other primary
--      domain AND never chose web -> repaired from membership.
--   3. Everything else -> untouched.
--
-- Membership inference takes the member's EARLIEST-JOINED department whose
-- slug is a primary domain: the first thing they picked is the best available
-- evidence of intent.
--
-- Idempotent.

-- 1. Normalise case/whitespace on any stored value.
UPDATE public.profiles
   SET primary_domain = lower(btrim(primary_domain))
 WHERE primary_domain IS NOT NULL
   AND primary_domain <> lower(btrim(primary_domain));

-- 2. Rows whose stored value is not a resolvable domain at all -> NULL, then
--    backfilled from membership below. This catches 'Blockchain ' and any
--    other junk.
UPDATE public.profiles p
   SET primary_domain = NULL
 WHERE p.primary_domain IS NOT NULL
   AND p.primary_domain NOT IN (
     'ai_ml','web','cybersecurity','dsa','blockchain','embedded'
   );

-- 3. The hardcoded-'web' defaults that contradict the member's memberships.
UPDATE public.profiles p
   SET primary_domain = inferred.domain
  FROM (
    SELECT DISTINCT ON (m.user_id)
           m.user_id,
           d.slug AS domain
      FROM public.department_memberships m
      JOIN public.departments d ON d.id = m.department_id
     WHERE d.slug IN ('ai_ml','web','cybersecurity','dsa','blockchain','embedded')
     ORDER BY m.user_id, m.joined_at ASC NULLS LAST, d.slug ASC
  ) inferred
 WHERE p.user_id = inferred.user_id
   -- stored value is the hardcoded default and is NOT one they actually picked
   AND (p.primary_domain = 'web' OR p.primary_domain IS NULL)
   AND inferred.domain IS DISTINCT FROM p.primary_domain
   AND NOT EXISTS (
     SELECT 1 FROM public.department_memberships m2
      JOIN public.departments d2 ON d2.id = m2.department_id
     WHERE m2.user_id = p.user_id AND d2.slug = p.primary_domain
   );

-- 4. Rows still invalid after all of the above -> NULL rather than a wrong
--    value. A null domain is honest: the member has not chosen yet, and the
--    onboarding flow prompts for it.
UPDATE public.profiles p
   SET primary_domain = NULL
 WHERE p.primary_domain IS NOT NULL
   AND p.primary_domain NOT IN (
     'ai_ml','web','cybersecurity','dsa','blockchain','embedded'
   );

COMMENT ON COLUMN public.profiles.primary_domain IS
  'Canonical slug from lib/domains.js PRIMARY_DOMAINS. Nullable; NULL when the '
  'member has not chosen a track, never silently defaulted. Was hardcoded to web '
  'for every signup until this migration.';
