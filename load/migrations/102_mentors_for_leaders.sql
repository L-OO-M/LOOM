-- Leaders mentor by default.
--
-- Being Core or holding a Head seat already means the chapter has vouched for
-- your work. Making those people apply for mentorship and wait for an admin was
-- a second gate on an honour that had already been granted -- and it left the
-- mentor directory empty while the chapter's most experienced people were on
-- the roster.
--
-- The trigger is the enforcement point, not the API: seats are granted from
-- several paths (role request approval, handover, admin status changes,
-- scoped grants), and a rule that lives in one of them is a rule the others
-- can bypass. After this, any profile that becomes Core or above has a mentor
-- row, whether or not the writer knew about this rule.
--
-- Nothing here removes a mentor on demotion: sessions, reviews and history
-- belong to the person, not to the seat. An admin can still set available =
-- false, which is the honest way to say "not taking requests right now".

CREATE OR REPLACE FUNCTION public.ensure_mentor_for_leader()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IN ('core', 'dept_lead', 'vertical_lead', 'admin') THEN
    INSERT INTO public.mentors (user_id, tenant_id, expertise)
    VALUES (
      NEW.user_id,
      NEW.tenant_id,
      COALESCE(NULLIF(btrim(NEW.primary_domain), ''), '')
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_ensure_mentor ON public.profiles;
CREATE TRIGGER profiles_ensure_mentor
AFTER INSERT OR UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_mentor_for_leader();

-- Backfill the people who already hold one of those roles. Idempotent: an
-- existing mentor row (with its bio and availability) is never overwritten.
INSERT INTO public.mentors (user_id, tenant_id, expertise)
SELECT p.user_id, p.tenant_id, COALESCE(NULLIF(btrim(p.primary_domain), ''), '')
FROM public.profiles p
WHERE p.role IN ('core', 'dept_lead', 'vertical_lead', 'admin')
ON CONFLICT (user_id) DO NOTHING;
