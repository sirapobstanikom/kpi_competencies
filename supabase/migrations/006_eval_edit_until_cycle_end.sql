-- ผู้ประเมินแก้คำตอบได้จนสิ้นวันสิ้นสุดรอบ (end_date, เทียบวันที่ไทย) และรอบยังไม่ closed
-- รวมถึงกรณีส่งแบบแล้ว (submitted) ยังแก้ได้ภายในเขตเวลา

CREATE OR REPLACE FUNCTION public.evaluator_can_modify_answers(p_evaluation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.evaluations e
    INNER JOIN public.evaluation_cycles c ON c.id = e.cycle_id
    WHERE e.id = p_evaluation_id
      AND e.evaluator_id = auth.uid()
      AND c.status IS DISTINCT FROM 'closed'
      AND c.end_date >= (timezone('Asia/Bangkok', now()))::date
      AND e.status IN ('draft', 'submitted')
  )
  OR public.is_admin();
$$;

GRANT EXECUTE ON FUNCTION public.evaluator_can_modify_answers(uuid) TO authenticated;

DROP POLICY IF EXISTS ca_iud_evaluator ON public.competency_answers;
DROP POLICY IF EXISTS ca_update_evaluator ON public.competency_answers;
DROP POLICY IF EXISTS ca_delete_evaluator ON public.competency_answers;
DROP POLICY IF EXISTS ka_iud_evaluator ON public.kpi_answers;
DROP POLICY IF EXISTS ka_update_evaluator ON public.kpi_answers;
DROP POLICY IF EXISTS ka_delete_evaluator ON public.kpi_answers;

CREATE POLICY ca_iud_evaluator ON public.competency_answers FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.evaluator_can_modify_answers(evaluation_id)
  );

CREATE POLICY ca_update_evaluator ON public.competency_answers FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR public.evaluator_can_modify_answers(evaluation_id)
  )
  WITH CHECK (
    public.is_admin()
    OR public.evaluator_can_modify_answers(evaluation_id)
  );

CREATE POLICY ca_delete_evaluator ON public.competency_answers FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR public.evaluator_can_modify_answers(evaluation_id)
  );

CREATE POLICY ka_iud_evaluator ON public.kpi_answers FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.evaluator_can_modify_answers(evaluation_id)
  );

CREATE POLICY ka_update_evaluator ON public.kpi_answers FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR public.evaluator_can_modify_answers(evaluation_id)
  )
  WITH CHECK (
    public.is_admin()
    OR public.evaluator_can_modify_answers(evaluation_id)
  );

CREATE POLICY ka_delete_evaluator ON public.kpi_answers FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR public.evaluator_can_modify_answers(evaluation_id)
  );
