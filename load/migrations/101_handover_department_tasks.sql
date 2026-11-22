-- What happens to the outgoing head's own department work at handover.
--
-- A demoted head keeps their membership, so nothing here is "orphaned" in the
-- database sense -- but work they took on *as the head* should follow the role,
-- not the person. Without this the incoming head inherits a department where
-- half the open work still sits with someone who has stepped down, and no
-- screen says so.
--
-- Default true, matching the existing transfer flags (planner, event ops, head
-- slot), so an approval made before this column existed keeps its intent. The
-- transfer only ever moves rows assigned to the OUTGOING head inside the one
-- department being handed over: member assignments are never touched.
ALTER TABLE public.lead_handovers
  ADD COLUMN IF NOT EXISTS transfer_tasks boolean NOT NULL DEFAULT true;
