import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { displayName, formatScore } from '../../lib/format'
import type { Department } from '../../types/database'

type Row = {
  employee_id: string
  name: string
  code: string | null
  final: number | null
}

export function DepartmentDashboardPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [deptId, setDeptId] = useState<string>('')
  const [rows, setRows] = useState<Row[]>([])
  const [avg, setAvg] = useState<number | null>(null)
  const [cycleId, setCycleId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      const { data: d } = await supabase
        .from('departments')
        .select('*')
        .eq('is_active', true)
        .order('name')
      setDepartments(d ?? [])
      if (d?.[0]?.id) setDeptId(d[0].id)
      const { data: c } = await supabase
        .from('evaluation_cycles')
        .select('id')
        .eq('status', 'active')
        .maybeSingle()
      setCycleId(c?.id ?? null)
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    if (!deptId || !cycleId) {
      setRows([])
      setAvg(null)
      return
    }
    void (async () => {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, employee_code, first_name, last_name, email')
        .eq('department_id', deptId)

      const { data: results } = await supabase
        .from('evaluation_results')
        .select('employee_id, final_score')
        .eq('cycle_id', cycleId)

      const scoreMap = new Map((results ?? []).map((r) => [r.employee_id, r.final_score]))

      const list: Row[] = (profs ?? []).map((p) => ({
        employee_id: p.id,
        name: displayName(p),
        code: p.employee_code,
        final: scoreMap.get(p.id) ?? null,
      }))
      list.sort((a, b) => (b.final ?? -1) - (a.final ?? -1))
      setRows(list)
      const nums = list.map((x) => x.final).filter((x): x is number => x != null)
      setAvg(nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null)
    })()
  }, [deptId, cycleId])

  const deptName = useMemo(
    () => departments.find((d) => d.id === deptId)?.name ?? '',
    [departments, deptId],
  )

  if (loading) {
    return <div className="text-center text-slate-500">กำลังโหลด…</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">แดชบอร์ดแผนก</h1>
          <p className="mt-1 text-sm text-slate-500">กรองตามแผนกและดูคะแนนรอบประเมิน active</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">แผนก</label>
          <select
            className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!cycleId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          ยังไม่มีรอบประเมินที่ active
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">{deptName}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            คะแนนเฉลี่ยแผนก: {formatScore(avg)}
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">รหัส</th>
              <th className="px-4 py-3">ชื่อ</th>
              <th className="px-4 py-3">คะแนนรวม</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  ไม่มีพนักงานในแผนกนี้
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-600">{r.code ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                  <td className="px-4 py-3">{formatScore(r.final)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/admin/employees/${r.employee_id}`}
                      className="text-brand-600 hover:underline"
                    >
                      รายละเอียด
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
