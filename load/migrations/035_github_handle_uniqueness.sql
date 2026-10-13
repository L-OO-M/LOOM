-- 035_github_handle_uniqueness: one GitHub handle per account.
--
-- WHY THIS EXISTS
-- POST /api/github used `ON CONFLICT (user_id)`, which guards one handle per
-- USER but says nothing about one user per HANDLE. Two accounts could both
-- claim @demonstrikkk, and both were live in this database.
--
-- The consequence was silent misattribution. resolveStudentIdByLogin resolves a
-- pushing login with `LIMIT 1` and no ORDER BY, so every delivery landed on
-- whichever row the planner returned first. A real push (commits=1, score=5)
-- was written to one member's activity ledger while the member actually
-- reading the page saw zero. The webhook looked healthy the whole time.
--
-- POLICY: first claimer keeps the handle. `created_at` on github_connections is
-- the moment the handle was linked, so that is the tie-break and it is
-- explainable rather than arbitrary.
--
-- Idempotent.

-- 1. Resolve existing duplicates, keeping the earliest link per handle.
--    github_connections has PK (user_id) and connected_at (001_foundation).
DO $$
DECLARE
  loser record;
  removed int := 0;
BEGIN
  FOR loser IN
    SELECT gc.user_id, lower(gc.github_username) AS handle
      FROM github_connections gc
     WHERE gc.user_id NOT IN (
       SELECT DISTINCT ON (lower(github_username)) user_id
         FROM github_connections
        WHERE github_username IS NOT NULL
        ORDER BY lower(github_username), connected_at ASC, user_id ASC
     )
  LOOP
    -- Keep profiles.github_username consistent with the surviving link.
    UPDATE profiles
       SET github_username = NULL
     WHERE user_id = loser.user_id
       AND lower(coalesce(github_username, '')) = loser.handle;

    DELETE FROM github_connections WHERE user_id = loser.user_id;
    removed := removed + 1;
    RAISE NOTICE 'released @% from user % (an earlier link kept it)', loser.handle, loser.user_id;
  END LOOP;
  RAISE NOTICE 'duplicate github_connections removed: %', removed;
END $$;

-- 2. A NULL username carries no identity, so exclude it from the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS github_connections_username_key
  ON public.github_connections (lower(github_username))
  WHERE github_username IS NOT NULL;

COMMENT ON INDEX public.github_connections_username_key IS
  'A GitHub handle belongs to exactly one account -- handles are globally unique '
  'on GitHub. Without this, resolveStudentIdByLogin picks arbitrarily and a '
  'member''s proof is written to somebody else''s ledger (migration 035).';
