import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { displayName } from '../../lib/format'
import { isUuid } from '../../lib/validation'
import { useAuth } from '../../context/AuthContext'
import type { Evaluation } from '../../types/database'

type Row = Evaluation & {
  employee?: { first_name: string; last_name: string; email: string; employee_code: string | null }
  cycle?: { name: string; year: number }
}

export function EvaluatorDashboardPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.id) return
    void (async () => {
      const { data: evs, error } = await supabase
        .from('evaluations')
        .select('*')
        .eq('evaluator_id', profile.id)
        .order('updated_at', { ascending: false })
      if (error || !evs) {
        setRows([])
        setLoading(false)
        return
      }
      const empIds = [...new Set(evs.map((e) => e.employee_id).filter(isUuid))]
      const cycIds = [...new Set(evs.map((e) => e.cycle_id).filter(isUuid))]
      const [{ data: emps }, { data: cycles }] = await Promise.all([
        empIds.length
          ? supabase
              .from('profiles')
              .select('id, first_name, last_name, email, employee_code')
              .in('id', empIds)
          : Promise.resolve({
              data: [] as {
                id: string
                first_name: string
                last_name: string
                email: string
                employee_code: string | null
              }[],
            }),
        cycIds.length
          ? supabase.from('evaluation_cycles').select('id, name, year').in('id', cycIds)
          : Promise.resolve({ data: [] as { id: string; name: string; year: number }[] }),
      ])
      const em = new Map((emps ?? []).map((e) => [e.id, e]))
      const cy = new Map((cycles ?? []).map((c) => [c.id, c]))
      setRows(
        evs.map((e) => ({
          ...e,
          employee: em.get(e.employee_id),
          cycle: cy.get(e.cycle_id),
        })),
      )
      setLoading(false)
    })()
  }, [profile?.id])

  if (loading) {
    return <div className="text-center text-slate-500">กำลังโหลด…</div>
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        ยังไม่มีรายการประเมินที่มอบหมายให้คุณ
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">งานประเมินของฉัน</h1>
        <p className="mt-1 text-sm text-slate-500">เลือกรายการเพื่อกรอกแบบประเมิน</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((r) => (
          <div
            key={r.id}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-200"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">
                  {r.employee
                    ? displayName(r.employee)
                    : 'พนักงาน'}
                </p>
                <p className="text-xs text-slate-500">
                  {r.employee?.employee_code && `รหัส ${r.employee.employee_code} · `}
                  {r.cycle ? `${r.cycle.name} (${r.cycle.year})` : ''}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  r.status === 'submitted'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {r.status === 'submitted' ? 'ส่งแล้ว' : 'ร่าง'}
              </span>
            </div>
            <Link
              to={`/evaluator/${r.id}`}
              className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline"
            >
              เปิดแบบประเมิน →
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
