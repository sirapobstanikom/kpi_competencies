-- Employee Performance Evaluation System — schema, RLS, triggers, seed
-- Run in Supabase SQL editor or via supabase db push

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  level int NOT NULL DEFAULT 0,
  use_managerial_competency boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  employee_code text UNIQUE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  email text NOT NULL,
  department_id uuid REFERENCES public.departments (id),
  position_id uuid REFERENCES public.positions (id),
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.evaluation_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  year int NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.competency_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('core', 'managerial')),
  question_text text NOT NULL,
  max_score int NOT NULL DEFAULT 5 CHECK (max_score = 5),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.kpi_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  max_score int NOT NULL DEFAULT 5 CHECK (max_score = 5),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.evaluator_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.evaluation_cycles (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  evaluator_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  weight numeric(6, 3) NOT NULL CHECK (weight >= 0 AND weight <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id, evaluator_id)
);

CREATE TABLE public.evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.evaluation_cycles (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  evaluator_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id, evaluator_id)
);

CREATE TABLE public.competency_answers (
  evaluation_id uuid NOT NULL REFERENCES public.evaluations (id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.competency_questions (id) ON DELETE CASCADE,
  score numeric(4, 2) NOT NULL CHECK (score >= 0 AND score <= 5),
  PRIMARY KEY (evaluation_id, question_id)
);

CREATE TABLE public.kpi_answers (
  evaluation_id uuid NOT NULL REFERENCES public.evaluations (id) ON DELETE CASCADE,
  kpi_id uuid NOT NULL REFERENCES public.kpi_items (id) ON DELETE CASCADE,
  score numeric(4, 2) NOT NULL CHECK (score >= 0 AND score <= 5),
  PRIMARY KEY (evaluation_id, kpi_id)
);

CREATE TABLE public.evaluation_results (
  employee_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.evaluation_cycles (id) ON DELETE CASCADE,
  core_score numeric(6, 4),
  managerial_score numeric(6, 4),
  competency_score numeric(6, 4),
  kpi_score numeric(6, 4),
  kpi_weighted numeric(6, 4),
  competency_weighted numeric(6, 4),
  final_score numeric(6, 4),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, cycle_id)
);

CREATE INDEX idx_profiles_department ON public.profiles (department_id);
CREATE INDEX idx_evaluations_evaluator ON public.evaluations (evaluator_id);
CREATE INDEX idx_evaluations_employee_cycle ON public.evaluations (employee_id, cycle_id);
CREATE INDEX idx_assignments_cycle_employee ON public.evaluator_assignments (cycle_id, employee_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.touch_evaluations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_evaluations_updated_at
BEFORE UPDATE ON public.evaluations
FOR EACH ROW
EXECUTE PROCEDURE public.touch_evaluations_updated_at();

-- ---------------------------------------------------------------------------
-- Aggregate scores (weighted evaluators) + business formula
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recalculate_evaluation_result(p_employee_id uuid, p_cycle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_position_id uuid;
  v_use_mgr boolean;
  v_assign_count int;
  v_submitted_count int;
  v_final_core numeric;
  v_final_mgr numeric;
  v_final_kpi numeric;
  v_competency numeric;
  v_kpi_w numeric;
  v_comp_w numeric;
  v_final numeric;
BEGIN
  SELECT position_id INTO v_position_id FROM public.profiles WHERE id = p_employee_id;
  IF v_position_id IS NULL THEN
    DELETE FROM public.evaluation_results WHERE employee_id = p_employee_id AND cycle_id = p_cycle_id;
    RETURN;
  END IF;

  SELECT use_managerial_competency INTO v_use_mgr FROM public.positions WHERE id = v_position_id;

  SELECT count(*)::int INTO v_assign_count
  FROM public.evaluator_assignments ea
  WHERE ea.employee_id = p_employee_id AND ea.cycle_id = p_cycle_id;

  SELECT count(*)::int INTO v_submitted_count
  FROM public.evaluations e
  WHERE e.employee_id = p_employee_id AND e.cycle_id = p_cycle_id AND e.status = 'submitted';

  IF v_assign_count = 0 OR v_submitted_count < v_assign_count THEN
    DELETE FROM public.evaluation_results WHERE employee_id = p_employee_id AND cycle_id = p_cycle_id;
    RETURN;
  END IF;

  WITH per_eval AS (
    SELECT
      ea.weight,
      (
        SELECT avg(ca.score)::numeric
        FROM public.competency_answers ca
        INNER JOIN public.competency_questions cq ON cq.id = ca.question_id AND cq.type = 'core'
        WHERE ca.evaluation_id = e.id
      ) AS core_avg,
      (
        SELECT avg(ca.score)::numeric
        FROM public.competency_answers ca
        INNER JOIN public.competency_questions cq ON cq.id = ca.question_id AND cq.type = 'managerial'
        WHERE ca.evaluation_id = e.id
      ) AS mgr_avg,
      (
        SELECT avg(ka.score)::numeric
        FROM public.kpi_answers ka
        WHERE ka.evaluation_id = e.id
      ) AS kpi_avg
    FROM public.evaluator_assignments ea
    INNER JOIN public.evaluations e
      ON e.cycle_id = ea.cycle_id
     AND e.employee_id = ea.employee_id
     AND e.evaluator_id = ea.evaluator_id
     AND e.status = 'submitted'
    WHERE ea.employee_id = p_employee_id AND ea.cycle_id = p_cycle_id
  ),
  agg AS (
    SELECT
      sum(coalesce(core_avg, 0) * (weight / 100.0)) AS fc,
      sum(coalesce(mgr_avg, 0) * (weight / 100.0)) AS fm,
      sum(coalesce(kpi_avg, 0) * (weight / 100.0)) AS fk
    FROM per_eval
  )
  SELECT fc, fm, fk INTO v_final_core, v_final_mgr, v_final_kpi FROM agg;

  IF v_use_mgr THEN
    v_competency := (coalesce(v_final_core, 0) + coalesce(v_final_mgr, 0)) / 2.0;
    v_final_mgr := coalesce(v_final_mgr, 0);
  ELSE
    v_competency := coalesce(v_final_core, 0);
    v_final_mgr := NULL;
  END IF;

  v_final_core := coalesce(v_final_core, 0);
  v_final_kpi := coalesce(v_final_kpi, 0);

  v_kpi_w := v_final_kpi * 0.7;
  v_comp_w := v_competency * 0.3;
  v_final := v_kpi_w + v_comp_w;

  INSERT INTO public.evaluation_results (
    employee_id, cycle_id,
    core_score, managerial_score, competency_score, kpi_score,
    kpi_weighted, competency_weighted, final_score, computed_at
  )
  VALUES (
    p_employee_id, p_cycle_id,
    v_final_core, v_final_mgr, v_competency, v_final_kpi,
    v_kpi_w, v_comp_w, v_final, now()
  )
  ON CONFLICT (employee_id, cycle_id) DO UPDATE SET
    core_score = EXCLUDED.core_score,
    managerial_score = EXCLUDED.managerial_score,
    competency_score = EXCLUDED.competency_score,
    kpi_score = EXCLUDED.kpi_score,
    kpi_weighted = EXCLUDED.kpi_weighted,
    competency_weighted = EXCLUDED.competency_weighted,
    final_score = EXCLUDED.final_score,
    computed_at = EXCLUDED.computed_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_evaluations_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp uuid;
  v_cyc uuid;
BEGIN
  v_emp := COALESCE(NEW.employee_id, OLD.employee_id);
  v_cyc := COALESCE(NEW.cycle_id, OLD.cycle_id);
  PERFORM public.recalculate_evaluation_result(v_emp, v_cyc);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER tr_evaluations_recalc_aiud
AFTER INSERT OR UPDATE OF status OR DELETE ON public.evaluations
FOR EACH ROW
EXECUTE PROCEDURE public.trg_evaluations_recalc();

CREATE OR REPLACE FUNCTION public.trg_answers_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eval uuid;
  v_emp uuid;
  v_cyc uuid;
BEGIN
  v_eval := COALESCE(NEW.evaluation_id, OLD.evaluation_id);
  SELECT employee_id, cycle_id INTO v_emp, v_cyc FROM public.evaluations WHERE id = v_eval;
  IF v_emp IS NOT NULL THEN
    PERFORM public.recalculate_evaluation_result(v_emp, v_cyc);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER tr_comp_answers_recalc_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.competency_answers
FOR EACH ROW
EXECUTE PROCEDURE public.trg_answers_recalc();

CREATE TRIGGER tr_kpi_answers_recalc_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.kpi_answers
FOR EACH ROW
EXECUTE PROCEDURE public.trg_answers_recalc();

-- ---------------------------------------------------------------------------
-- Auth: profile on signup
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE PROCEDURE public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluator_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_results ENABLE ROW LEVEL SECURITY;

-- departments
CREATE POLICY departments_select ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY departments_all_admin ON public.departments FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- positions
CREATE POLICY positions_select ON public.positions FOR SELECT TO authenticated USING (true);
CREATE POLICY positions_all_admin ON public.positions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- profiles
CREATE POLICY profiles_select_self_or_admin ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY profiles_select_as_evaluator ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluator_assignments ea
      WHERE ea.evaluator_id = auth.uid() AND ea.employee_id = profiles.id
    )
    OR EXISTS (
      SELECT 1 FROM public.evaluations ev
      WHERE ev.evaluator_id = auth.uid() AND ev.employee_id = profiles.id
    )
  );
CREATE POLICY profiles_select_my_evaluators ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.evaluator_assignments ea
      WHERE ea.employee_id = auth.uid() AND ea.evaluator_id = profiles.id
    )
  );
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND is_admin = (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid())
  );
CREATE POLICY profiles_all_admin ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- cycles
CREATE POLICY cycles_select ON public.evaluation_cycles FOR SELECT TO authenticated USING (true);
CREATE POLICY cycles_write_admin ON public.evaluation_cycles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY cycles_update_admin ON public.evaluation_cycles FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY cycles_delete_admin ON public.evaluation_cycles FOR DELETE TO authenticated
  USING (public.is_admin());

-- master questions
CREATE POLICY cq_select ON public.competency_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY cq_admin ON public.competency_questions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY kpi_select ON public.kpi_items FOR SELECT TO authenticated USING (true);
CREATE POLICY kpi_admin ON public.kpi_items FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- evaluator_assignments
CREATE POLICY ea_select ON public.evaluator_assignments FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR evaluator_id = auth.uid()
    OR employee_id = auth.uid()
  );
CREATE POLICY ea_write_admin ON public.evaluator_assignments FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY ea_update_admin ON public.evaluator_assignments FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY ea_delete_admin ON public.evaluator_assignments FOR DELETE TO authenticated
  USING (public.is_admin());

-- evaluations
CREATE POLICY ev_select ON public.evaluations FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR evaluator_id = auth.uid()
    OR employee_id = auth.uid()
  );
CREATE POLICY ev_insert_admin ON public.evaluations FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY ev_update_evaluator ON public.evaluations FOR UPDATE TO authenticated
  USING (evaluator_id = auth.uid() OR public.is_admin())
  WITH CHECK (evaluator_id = auth.uid() OR public.is_admin());
CREATE POLICY ev_delete_admin ON public.evaluations FOR DELETE TO authenticated
  USING (public.is_admin());

-- competency_answers: evaluator owns evaluation; employee sees submitted; admin all
CREATE POLICY ca_select ON public.competency_answers FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.evaluator_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.employee_id = auth.uid() AND e.status = 'submitted'
    )
  );
CREATE POLICY ca_iud_evaluator ON public.competency_answers FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.evaluator_id = auth.uid() AND e.status = 'draft'
    )
    OR public.is_admin()
  );
CREATE POLICY ca_update_evaluator ON public.competency_answers FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.evaluator_id = auth.uid() AND e.status = 'draft'
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.evaluator_id = auth.uid() AND e.status = 'draft'
    )
  );
CREATE POLICY ca_delete_evaluator ON public.competency_answers FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.evaluator_id = auth.uid() AND e.status = 'draft'
    )
  );

-- kpi_answers — same pattern
CREATE POLICY ka_select ON public.kpi_answers FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.evaluator_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.employee_id = auth.uid() AND e.status = 'submitted'
    )
  );
CREATE POLICY ka_iud_evaluator ON public.kpi_answers FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.evaluator_id = auth.uid() AND e.status = 'draft'
    )
    OR public.is_admin()
  );
CREATE POLICY ka_update_evaluator ON public.kpi_answers FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.evaluator_id = auth.uid() AND e.status = 'draft'
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.evaluator_id = auth.uid() AND e.status = 'draft'
    )
  );
CREATE POLICY ka_delete_evaluator ON public.kpi_answers FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.id = evaluation_id AND e.evaluator_id = auth.uid() AND e.status = 'draft'
    )
  );

-- evaluation_results
CREATE POLICY er_select ON public.evaluation_results FOR SELECT TO authenticated
  USING (public.is_admin() OR employee_id = auth.uid());
CREATE POLICY er_admin_write ON public.evaluation_results FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- Atomic replace assignments (weights = 100%) + sync evaluation rows
-- PostgREST uses one txn per statement; batch changes must use this RPC.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_evaluator_assignments(
  p_cycle_id uuid,
  p_employee_id uuid,
  p_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum numeric;
  r jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.cycle_id = p_cycle_id AND e.employee_id = p_employee_id AND e.status = 'submitted'
    ) THEN
      RAISE EXCEPTION 'cannot clear assignments: submitted evaluations exist';
    END IF;
    DELETE FROM public.evaluator_assignments
    WHERE cycle_id = p_cycle_id AND employee_id = p_employee_id;
    DELETE FROM public.evaluations
    WHERE cycle_id = p_cycle_id AND employee_id = p_employee_id;
    RETURN;
  END IF;

  SELECT coalesce(sum((e ->> 'weight')::numeric), 0) INTO v_sum
  FROM jsonb_array_elements(p_rows) AS x(e);
  IF v_sum <> 100 THEN
    RAISE EXCEPTION 'evaluator weights must total exactly 100 (current: %)', v_sum;
  END IF;

  FOR r IN SELECT x.e FROM jsonb_array_elements(p_rows) AS x(e)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = (r ->> 'evaluator_id')::uuid
    ) THEN
      RAISE EXCEPTION 'invalid evaluator_id';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.evaluations e
    WHERE e.cycle_id = p_cycle_id AND e.employee_id = p_employee_id AND e.status = 'submitted'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_rows) x
      WHERE (x ->> 'evaluator_id')::uuid = e.evaluator_id
    )
  ) THEN
    RAISE EXCEPTION 'cannot drop evaluator who already submitted for this employee/cycle';
  END IF;

  DELETE FROM public.evaluator_assignments
  WHERE cycle_id = p_cycle_id AND employee_id = p_employee_id;

  FOR r IN SELECT x.e FROM jsonb_array_elements(p_rows) AS x(e)
  LOOP
    INSERT INTO public.evaluator_assignments (cycle_id, employee_id, evaluator_id, weight)
    VALUES (
      p_cycle_id,
      p_employee_id,
      (r ->> 'evaluator_id')::uuid,
      (r ->> 'weight')::numeric
    );
  END LOOP;

  DELETE FROM public.evaluations e
  WHERE e.cycle_id = p_cycle_id AND e.employee_id = p_employee_id
    AND e.status = 'draft'
    AND NOT EXISTS (
      SELECT 1 FROM public.evaluator_assignments ea
      WHERE ea.cycle_id = e.cycle_id
        AND ea.employee_id = e.employee_id
        AND ea.evaluator_id = e.evaluator_id
    );

  INSERT INTO public.evaluations (cycle_id, employee_id, evaluator_id, status)
  SELECT p_cycle_id, p_employee_id, ea.evaluator_id, 'draft'
  FROM public.evaluator_assignments ea
  WHERE ea.cycle_id = p_cycle_id AND ea.employee_id = p_employee_id
  ON CONFLICT (cycle_id, employee_id, evaluator_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_evaluator_assignments(uuid, uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed: departments, positions, questions, KPIs
-- ---------------------------------------------------------------------------

INSERT INTO public.departments (name, code) VALUES
  ('ฝ่ายทรัพยากรบุคคล', 'HR'),
  ('ส่วนบริหารค่าตอบแทนและสวัสดิการ', 'C&B'),
  ('ส่วนพัฒนาบุคคล', 'L&D'),
  ('ส่วนบริหารทรัพยากรบุคคล', 'HROP')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.positions (name, code, level, use_managerial_competency) VALUES
  ('ผู้ช่วยผู้บริหารฝ่าย', 'ASST_MGR', 4, true),
  ('ผู้เชี่ยวชาญพิเศษ', 'SPEC_SR', 3, true),
  ('ผู้เชี่ยวชาญ', 'SPEC', 2, false),
  ('ผู้บริหารส่วน', 'SECTION_HEAD', 5, true),
  ('ผู้ชำนาญการ', 'SENIOR', 1, false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.competency_questions (type, question_text, sort_order)
SELECT v.type, v.question_text, v.sort_order
FROM (
  VALUES
    ('core'::text, 'ความรับผิดชอบต่อภารกิจและคุณภาพงาน'::text, 1),
    ('core', 'การทำงานร่วมกันและการสื่อสาร', 2),
    ('core', 'การเรียนรู้และพัฒนาตนเอง', 3),
    ('managerial', 'การวางแผนและมอบหมายงาน', 10),
    ('managerial', 'การพัฒนาทีมและโค้ช', 11),
    ('managerial', 'การตัดสินใจเชิงยุทธศาสตร์', 12)
) AS v(type, question_text, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.competency_questions cq
  WHERE cq.type = v.type AND cq.question_text = v.question_text
);

INSERT INTO public.kpi_items (title, sort_order)
SELECT v.title, v.sort_order
FROM (
  VALUES
    ('ผลสำเร็จตามเป้าหมายงานที่ตกลง'::text, 1),
    ('ประสิทธิภาพและตัวชี้วัดงาน', 2),
    ('นวัตกรรม / การปรับปรุง', 3)
) AS v(title, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.kpi_items k WHERE k.title = v.title
);
