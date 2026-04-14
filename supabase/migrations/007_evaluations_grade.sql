-- เกรดที่ผู้ประเมินเลือกต่อแบบ (แถว evaluations)
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS grade text NULL;

ALTER TABLE public.evaluations
  DROP CONSTRAINT IF EXISTS evaluations_grade_check;

ALTER TABLE public.evaluations
  ADD CONSTRAINT evaluations_grade_check
  CHECK (grade IS NULL OR grade IN ('A', 'B+', 'B', 'C+', 'C'));

COMMENT ON COLUMN public.evaluations.grade IS 'เกรดที่ผู้ประเมินเลือก (A, B+, B, C+, C)';
