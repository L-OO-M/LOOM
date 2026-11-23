-- Long-form event pages.
--
-- A hackathon brief needs more than a description: an overview, problem
-- statements, prizes, a schedule, rules, a FAQ and resource links. Modelling
-- each as a column would force a migration per block, so the ordered blocks live
-- in one jsonb array of typed sections. `tagline` gives the hero a one-line hook
-- and `cover_image_url` lets a lead use real artwork when they have it (the
-- generated banner remains the fallback, so no upload is required).
--
-- Validation lives in lib/event-page.js: unknown section types fall back to
-- overview, links must be https, and the image must be https or an app path.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS page_sections jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.events.tagline IS
  'One-line hook shown under the event title. Max 160 characters.';
COMMENT ON COLUMN public.events.cover_image_url IS
  'Optional real cover image. Falls back to the generated EventBanner.';
COMMENT ON COLUMN public.events.page_sections IS
  'Ordered typed blocks: overview, problem, prizes, schedule, rules, faq, resources.';
