export type CycleStatus = 'draft' | 'active' | 'closed'
export type EvaluationStatus = 'draft' | 'submitted'
export type CompetencyType = 'core' | 'managerial'

export type Profile = {
  id: string
  employee_code: string | null
  first_name: string
  last_name: string
  email: string
  department_id: string | null
  position_id: string | null
  is_admin: boolean
  created_at: string
}

export type Department = {
  id: string
  name: string
  code: string
  is_active: boolean
  created_at: string
}

export type Position = {
  id: string
  name: string
  code: string
  level: number
  use_managerial_competency: boolean
  is_active: boolean
  created_at: string
}

export type EvaluationCycle = {
  id: string
  name: string
  year: number
  start_date: string
  end_date: string
  status: CycleStatus
  created_at: string
}

export type Evaluation = {
  id: string
  cycle_id: string
  employee_id: string
  evaluator_id: string
  status: EvaluationStatus
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export type EvaluationResult = {
  employee_id: string
  cycle_id: string
  core_score: number | null
  managerial_score: number | null
  competency_score: number | null
  kpi_score: number | null
  kpi_weighted: number | null
  competency_weighted: number | null
  final_score: number | null
  computed_at: string
}

export type EvaluatorAssignment = {
  id: string
  cycle_id: string
  employee_id: string
  evaluator_id: string
  weight: number
  created_at: string
}
