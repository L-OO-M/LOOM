-- A mentor's area comes from the seat the chapter gave them, not from the
-- domain they picked for themselves.
--
-- 102 seeded `mentors.expertise` from `profiles.primary_domain`, which is what a
-- member chose during onboarding. That is self-declared. What the directory
-- should say is the position the super admin actually assigned: "AI / ML ·
-- Head", "Web · Core", "Vertical Lead". Two members can pick the same domain;
-- only one of them was given the seat.
--
-- The label is built from `department_memberships` (an appointment) and falls
-- back to the role itself when someone holds no department seat.

CREATE OR REPLACE FUNCTION public.mentor_position_label(
  p_user_id text,
  p_role text,
  p_vertical text
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT string_agg(
               d.name || CASE m.level WHEN 'dept_lead' THEN ' · Head' ELSE ' · Core' END,
               ', ' ORDER BY d.name
             )
      FROM public.department_memberships m
      JOIN public.departments d ON d.id = m.department_id
      WHERE m.user_id = p_user_id
        AND (m.term_end IS NULL OR m.term_end >= CURRENT_DATE)
    ),
    CASE p_role
      WHEN 'vertical_lead' THEN 'Vertical Lead'
      WHEN 'admin' THEN 'Chapter Admin'
      WHEN 'dept_lead' THEN 'Department Head'
      ELSE 'Core member'
    END
  );
$$;

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
      public.mentor_position_label(NEW.user_id, NEW.role, NEW.vertical)
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Repair the rows 102 created from the self-chosen domain. A row whose
-- expertise no longer matches the old seed was edited by an admin, and is left
-- exactly as written.
UPDATE public.mentors m
SET expertise = public.mentor_position_label(p.user_id, p.role, p.vertical)
FROM public.profiles p
WHERE p.user_id = m.user_id
  AND p.role IN ('core', 'dept_lead', 'vertical_lead', 'admin')
  AND (
    btrim(COALESCE(m.expertise, '')) = ''
    OR m.expertise IS NOT DISTINCT FROM COALESCE(NULLIF(btrim(p.primary_domain), ''), '')
  );
