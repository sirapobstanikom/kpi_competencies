import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { displayName, formatScore } from '../../lib/format'
import type { Department, EvaluationResult } from '../../types/database'

const ALL_DEPARTMENTS = '__all__'
const GRADE_OPTIONS = ['A', 'B+', 'B', 'C+', 'C'] as const

type ResultRow = Pick<EvaluationResult, 'employee_id' | 'core_score' | 'managerial_score' | 'kpi_score' | 'kpi_weighted' | 'competency_weighted' | 'final_score'>
type EvalRow = { id: string; employee_id: string; evaluator_id: string; grade: string | null }
type Row = {
  employee_id: string
  name: string
  code: string | null
  dept_name: string | null
  core: number | null
  managerial: number | null
  competency_avg: number | null
  kpi: number | null
  kpi70: number | null
  comp30: number | null
  final: number | null
  grade: string | null
  can_set_grade: boolean
  grade_eval_id: string | null
}

function competencyDisplayAvg(core: number | null, mgr: number | null): number | null {
  if (core == null) return null
  if (mgr == null) return core
  return (core + mgr) / 2
}

function average(nums: (number | null)[]): number | null {
  const ok = nums.filter((x): x is number => x != null && !Number.isNaN(x))
  if (!ok.length) return null
  return ok.reduce((a, b) => a + b, 0) / ok.length
}

export function DepartmentDashboardPage() {
  const { profile } = useAuth()
  const [departments, setDepartments] = useState<Department[]>([])
  const [deptId, setDeptId] = useState<string>(ALL_DEPARTMENTS)
  const [rows, setRows] = useState<Row[]>([])
  const [cycleId, setCycleId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingEmpId, setSavingEmpId] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const { data: d } = await supabase.from('departments').select('*').eq('is_active', true).order('name')
      setDepartments(d ?? [])
      const { data: c } = await supabase.from('evaluation_cycles').select('id').eq('status', 'active').maybeSingle()
      setCycleId(c?.id ?? null)
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    if (!cycleId) {
      setRows([])
      return
    }
    void (async () => {
      let profQuery = supabase
        .from('profiles')
        .select('id, employee_code, first_name, last_name, email, department_id, departments(name)')
        .order('employee_code')
      if (deptId !== ALL_DEPARTMENTS) profQuery = profQuery.eq('department_id', deptId)
      const { data: profs } = await profQuery
      const empIds = (profs ?? []).map((p) => p.id)

      const [{ data: results }, { data: evals }, { data: assigns }] = await Promise.all([
        supabase
          .from('evaluation_results')
          .select('employee_id, core_score, managerial_score, kpi_score, kpi_weighted, competency_weighted, final_score')
          .eq('cycle_id', cycleId),
        empIds.length
          ? supabase.from('evaluations').select('id, employee_id, evaluator_id, grade').eq('cycle_id', cycleId).in('employee_id', empIds)
          : Promise.resolve({ data: [] as EvalRow[] }),
        empIds.length
          ? supabase.from('evaluator_assignments').select('employee_id, evaluator_id, weight').eq('cycle_id', cycleId).in('employee_id', empIds)
          : Promise.resolve({ data: [] as { employee_id: string; evaluator_id: string; weight: number }[] }),
      ])

      const resultMap = new Map((results ?? []).map((r) => [r.employee_id, r as ResultRow]))
      const weightMaps = new Map<string, Map<string, number>>()
      for (const a of assigns ?? []) {
        const m = weightMaps.get(a.employee_id) ?? new Map<string, number>()
        m.set(a.evaluator_id, Number(a.weight))
        weightMaps.set(a.employee_id, m)
      }

      const evalsByEmp = new Map<string, EvalRow[]>()
      for (const e of evals ?? []) {
        const list = evalsByEmp.get(e.employee_id) ?? []
        list.push(e as EvalRow)
        evalsByEmp.set(e.employee_id, list)
      }

      const list: Row[] = (profs ?? []).map((p) => {
        const r = resultMap.get(p.id)
        const deptName = p.departments && typeof p.departments === 'object' && 'name' in p.departments ? String((p.departments as { name: string }).name) : null
        const empEvals = evalsByEmp.get(p.id) ?? []
        const weightByEvaluator = weightMaps.get(p.id) ?? new Map<string, number>()
        const topEval = [...empEvals].sort((a, b) => (weightByEvaluator.get(b.evaluator_id) ?? 0) - (weightByEvaluator.get(a.evaluator_id) ?? 0))[0]
        const ownEval = profile?.id ? empEvals.find((e) => e.evaluator_id === profile.id) : undefined
        const editableEval = profile?.is_admin ? topEval : ownEval
        const displayGrade = profile?.is_admin ? (topEval?.grade ?? null) : (ownEval?.grade ?? topEval?.grade ?? null)

        return {
          employee_id: p.id,
          name: displayName(p),
          code: p.employee_code,
          dept_name: deptName,
          core: r?.core_score ?? null,
          managerial: r?.managerial_score ?? null,
          competency_avg: competencyDisplayAvg(r?.core_score ?? null, r?.managerial_score ?? null),
          kpi: r?.kpi_score ?? null,
          kpi70: r?.kpi_weighted ?? null,
          comp30: r?.competency_weighted ?? null,
          final: r?.final_score ?? null,
          grade: displayGrade,
          can_set_grade: Boolean((profile?.is_admin || ownEval) && editableEval),
          grade_eval_id: editableEval?.id ?? null,
        }
      })

      list.sort((a, b) => (b.final ?? -1) - (a.final ?? -1))
      setRows(list)
    })()
  }, [deptId, cycleId, profile?.id, profile?.is_admin])

  async function updateGrade(row: Row, grade: string) {
    if (!row.can_set_grade || !row.grade_eval_id) return
    setSavingEmpId(row.employee_id)
    const next = grade === '' ? null : grade
    const { error } = await supabase.from('evaluations').update({ grade: next }).eq('id', row.grade_eval_id)
    if (error) {
      toast.error(error.message)
      setSavingEmpId(null)
      return
    }
    setRows((prev) => prev.map((r) => (r.employee_id === row.employee_id ? { ...r, grade: next } : r)))
    toast.success('Saved grade')
    setSavingEmpId(null)
  }

  const showDeptColumn = deptId === ALL_DEPARTMENTS
  const deptLabel = useMemo(() => (deptId === ALL_DEPARTMENTS ? 'All departments' : departments.find((d) => d.id === deptId)?.name ?? ''), [departments, deptId])
  const footerAvg = useMemo(() => {
    if (!rows.length) return null
    return {
      core: average(rows.map((r) => r.core)),
      managerial: average(rows.map((r) => r.managerial)),
      competency: average(rows.map((r) => r.competency_avg)),
      kpi: average(rows.map((r) => r.kpi)),
      kpi70: average(rows.map((r) => r.kpi70)),
      comp30: average(rows.map((r) => r.comp30)),
      final: average(rows.map((r) => r.final)),
    }
  }, [rows])

  if (loading) return <div className="text-center text-slate-500">Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Department Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Visible for everyone. Grade can be set by evaluator or admin only.</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Department</label>
          <select className="mt-1 min-h-11 min-w-[12rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
            <option value={ALL_DEPARTMENTS}>All</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!cycleId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No active cycle</div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">{deptLabel}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">Average final: {formatScore(footerAvg?.final ?? null)}</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-3 py-3">Code</th>
              <th className="min-w-[8rem] px-3 py-3">Name</th>
              {showDeptColumn && <th className="px-3 py-3">Department</th>}
              <th className="px-2 py-3">Core</th>
              <th className="px-2 py-3">Mgr</th>
              <th className="px-2 py-3">Competency</th>
              <th className="px-2 py-3">KPI</th>
              <th className="px-2 py-3">KPI*70%</th>
              <th className="px-2 py-3">Comp*30%</th>
              <th className="px-2 py-3">Final</th>
              <th className="px-2 py-3">Grade</th>
              <th className="px-3 py-3 text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={showDeptColumn ? 12 : 11} className="px-4 py-8 text-center text-slate-500">No employee rows</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2.5 text-slate-600">{r.code ?? '-'}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-900">{r.name}</td>
                  {showDeptColumn && <td className="max-w-[10rem] truncate px-3 py-2.5 text-slate-600" title={r.dept_name ?? ''}>{r.dept_name ?? '-'}</td>}
                  <td className="whitespace-nowrap px-2 py-2.5 tabular-nums">{formatScore(r.core)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 tabular-nums">{formatScore(r.managerial)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 tabular-nums">{formatScore(r.competency_avg)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 tabular-nums">{formatScore(r.kpi)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 tabular-nums">{formatScore(r.kpi70)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 tabular-nums">{formatScore(r.comp30)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 font-semibold tabular-nums text-slate-900">{formatScore(r.final)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5">{r.can_set_grade ? (
                    <select value={r.grade ?? ''} disabled={savingEmpId === r.employee_id} onChange={(e) => void updateGrade(r, e.target.value)} className="min-h-9 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-medium text-brand-800">
                      <option value="">-</option>
                      {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  ) : <span className="font-medium text-brand-800">{r.grade ?? '-'}</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><Link to={`/admin/employees/${r.employee_id}`} className="text-brand-600 hover:underline">Detail</Link></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
