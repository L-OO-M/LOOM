-- 087_founder_protection.sql
--
-- The founder seat is permanent. Application code already refuses to demote,
-- suspend or reassign it, but the database was still one DELETE away from
-- erasing the only account that can administer the platform. These triggers make
-- the invariant structural: it holds for the app, for a hand-written query, and
-- for any other service that holds credentials.
--
-- Triggers do not fire for a session running with
-- `session_replication_role = replica` (pg_dump/restore, logical replication),
-- which is deliberate: a restore must be able to rebuild the table. Everything
-- that reaches the table as a normal client is covered.
--
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS, safe to re-run.

-- ---------------------------------------------------------------------------
-- platform_admins: a locked/founder seat can never be deleted
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_locked_platform_admin_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.locked OR OLD.is_founder THEN
    RAISE EXCEPTION 'Founder seat for % is permanent and cannot be deleted', OLD.user_id
      USING ERRCODE = 'restrict_violation',
            HINT = 'Founder seats are permanent by design. Removing one requires a deliberate migration, never a DELETE.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS platform_admins_block_locked_delete ON public.platform_admins;
CREATE TRIGGER platform_admins_block_locked_delete
  BEFORE DELETE ON public.platform_admins
  FOR EACH ROW
  EXECUTE FUNCTION public.block_locked_platform_admin_delete();

-- TRUNCATE is a statement, not a row operation, so the row trigger above never
-- sees it. A table that holds permanent seats must not be emptied either.
CREATE OR REPLACE FUNCTION public.block_platform_admin_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'platform_admins holds permanent founder seats and cannot be truncated'
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS platform_admins_block_truncate ON public.platform_admins;
CREATE TRIGGER platform_admins_block_truncate
  BEFORE TRUNCATE ON public.platform_admins
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.block_platform_admin_truncate();

-- A founder seat's flags are one-way. Flipping `locked` or `is_founder` to
-- false would silently turn the DELETE guard off, so that transition is refused
-- here rather than trusted to every future caller.
CREATE OR REPLACE FUNCTION public.protect_founder_seat_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.locked AND NOT NEW.locked THEN
    RAISE EXCEPTION 'The founder seat for % is locked and cannot be unlocked', OLD.user_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.is_founder AND NOT NEW.is_founder THEN
    RAISE EXCEPTION 'The founder seat for % cannot be converted to a non-founder seat', OLD.user_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_admins_protect_flags ON public.platform_admins;
CREATE TRIGGER platform_admins_protect_flags
  BEFORE UPDATE ON public.platform_admins
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_founder_seat_flags();

-- ---------------------------------------------------------------------------
-- profiles: deleting the founder's profile row is deleting the founder
-- ---------------------------------------------------------------------------
-- Deleting profiles.user_id does not cascade to platform_admins (there is no
-- foreign key), so without this guard a DELETE would leave the seat pointing at
-- a user that no longer has a profile. The account would be locked out of every
-- screen while still holding the permanent seat, and the seat could never be
-- reclaimed because claim-first only runs when the table is empty.
CREATE OR REPLACE FUNCTION public.block_founder_profile_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = OLD.user_id AND (locked OR is_founder)
  ) THEN
    RAISE EXCEPTION 'The profile for % belongs to a permanent founder seat and cannot be deleted', OLD.user_id
      USING ERRCODE = 'restrict_violation',
            HINT = 'Suspend or reassign regular members instead. Founder rows are protected by migration 087.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_founder_delete ON public.profiles;
CREATE TRIGGER profiles_block_founder_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.block_founder_profile_delete();

CREATE OR REPLACE FUNCTION public.block_founder_profile_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_admins WHERE locked OR is_founder) THEN
    RAISE EXCEPTION 'profiles cannot be truncated while a permanent founder seat exists'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_founder_truncate ON public.profiles;
CREATE TRIGGER profiles_block_founder_truncate
  BEFORE TRUNCATE ON public.profiles
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.block_founder_profile_truncate();

COMMENT ON FUNCTION public.block_locked_platform_admin_delete() IS
  'Migration 087: permanent founder seats cannot be deleted.';
COMMENT ON FUNCTION public.block_founder_profile_delete() IS
  'Migration 087: a founder''s profile row cannot be deleted while the seat exists.';
