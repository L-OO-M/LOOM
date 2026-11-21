-- 093_practice_question_titles: replace placeholder problem titles with the
-- real LeetCode names.
--
-- WHY THIS EXISTS
-- One scheduled week was created by pasting real LeetCode URLs while typing
-- keyboard-mash titles ("hjgvghg", "bcghgc", ...). The slugs were genuine, so
-- the questions were genuine, and members had already recorded solves against
-- three of them. Deleting the week would have destroyed that evidence, so the
-- titles are repaired in place instead.
--
-- The match is on BOTH the slug and the junk title. A title a human chose
-- deliberately is never overwritten, and a second run matches nothing.
--
-- Difficulty is corrected in the same statement because the placeholder rows
-- were all marked Easy; these problems are Medium/Hard on LeetCode. Scoring
-- uses credited solves, not difficulty, so this changes presentation only.
--
-- Additive, idempotent.

UPDATE public.practice_questions AS q
SET title = v.title,
    difficulty = v.difficulty
FROM (VALUES
  ('gas-station', 'Gas Station', 'Medium', 'hjgvghg'),
  ('jump-game-ii', 'Jump Game II', 'Medium', 'bcghgc'),
  ('minimum-add-to-make-parentheses-valid', 'Minimum Add to Make Parentheses Valid', 'Medium', 'bhjbhbul'),
  ('task-scheduler', 'Task Scheduler', 'Medium', 'hujguigu'),
  ('minimum-cost-to-hire-k-workers', 'Minimum Cost to Hire K Workers', 'Hard', 'bnuigbuoig'),
  ('candy', 'Candy', 'Hard', 'uibhuigyu'),
  ('minimum-number-of-refueling-stops', 'Minimum Number of Refueling Stops', 'Hard', 'gyuguoiy')
) AS v(slug, title, difficulty, junk_title)
WHERE q.slug = v.slug
  AND btrim(q.title) = v.junk_title;

-- The week itself was named "Something". Rename it only while it is still that
-- placeholder AND still holds the repaired set, so an unrelated week that
-- happens to be called "Something" is left alone.
UPDATE public.practice_weeks AS w
SET title = 'Greedy and scheduling'
WHERE btrim(w.title) = 'Something'
  AND EXISTS (
    SELECT 1
    FROM public.practice_questions q
    WHERE q.week_id = w.id
      AND q.slug = 'gas-station'
  );
