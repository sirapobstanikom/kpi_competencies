-- คะแนนแบบประเมิน: 1–5 (เดิมอนุญาต 0–5) — ปรับข้อมูลเก่าก่อนเปลี่ยน constraint
UPDATE public.competency_answers SET score = 1 WHERE score < 1;
UPDATE public.competency_answers SET score = 5 WHERE score > 5;
UPDATE public.kpi_answers SET score = 1 WHERE score < 1;
UPDATE public.kpi_answers SET score = 5 WHERE score > 5;

ALTER TABLE public.competency_answers DROP CONSTRAINT IF EXISTS competency_answers_score_check;
ALTER TABLE public.competency_answers
  ADD CONSTRAINT competency_answers_score_check CHECK (score >= 1 AND score <= 5);

ALTER TABLE public.kpi_answers DROP CONSTRAINT IF EXISTS kpi_answers_score_check;
ALTER TABLE public.kpi_answers
  ADD CONSTRAINT kpi_answers_score_check CHECK (score >= 1 AND score <= 5);
