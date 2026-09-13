-- 003_activity_unique: upserts need a matching unique constraint
-- Tracked migration. Apply with: node load/migrate.js (or npm run db:migrate)
CREATE UNIQUE INDEX IF NOT EXISTS student_daily_activity_student_day_unique
  ON public.student_daily_activity(student_id, day);
CREATE INDEX IF NOT EXISTS student_daily_activity_student_idx ON public.student_daily_activity(student_id);
