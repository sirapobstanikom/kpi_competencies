import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatScore } from '../../lib/format'
import type { EvaluationCycle, EvaluationResult } from '../../types/database'

type Row = EvaluationResult & { cycle?: Pick<EvaluationCycle, 'name' | 'year'> }

export function EmployeeDashboardPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.id) return
    void (async () => {
      const { data: res } = await supabase
        .from('evaluation_results')
        .select('*')
        .eq('employee_id', profile.id)
        .order('computed_at', { ascending: false })
      const cids = [...new Set((res ?? []).map((r) => r.cycle_id))]
      const { data: cycles } = cids.length
        ? await supabase.from('evaluation_cycles').select('id, name, year').in('id', cids)
        : { data: [] as { id: string; name: string; year: number }[] }
      const cm = new Map((cycles ?? []).map((c) => [c.id, c]))
      setRows(
        (res ?? []).map((r) => ({
          ...r,
          cycle: cm.get(r.cycle_id),
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
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
        <h1 className="text-xl font-semibold text-slate-900">ผลประเมินของฉัน</h1>
        <p className="mt-2 text-sm text-slate-500">
          ยังไม่มีผลคำนวณ — จะแสดงเมื่อผู้ประเมินทุกคนส่งแบบครบแล้ว
        </p>
      </div>
    )
  }

  const latest = rows[0]!

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">ผลประเมินของฉัน</h1>
        <p className="mt-1 text-sm text-slate-500">รอบล่าสุด: {latest.cycle?.name} ({latest.cycle?.year})</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ScoreCard label="Core (ถ่วงน้ำหนัก)" value={latest.core_score} />
        <ScoreCard label="Managerial (ถ่วงน้ำหนัก)" value={latest.managerial_score} />
        <ScoreCard label="Competency รวม" value={latest.competency_score} />
        <ScoreCard label="KPI (ถ่วงน้ำหนัก)" value={latest.kpi_score} />
        <ScoreCard label="KPI × 0.7" value={latest.kpi_weighted} />
        <ScoreCard label="Competency × 0.3" value={latest.competency_weighted} />
        <div className="rounded-xl border-2 border-brand-200 bg-brand-50 p-5 sm:col-span-2 lg:col-span-3">
          <p className="text-sm font-medium text-brand-800">คะแนนรวมสุดท้าย</p>
          <p className="mt-1 text-3xl font-bold text-brand-900">{formatScore(latest.final_score)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">ประวัติย้อนหลัง</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-4">รอบ</th>
                <th className="py-2 pr-4">Core</th>
                <th className="py-2 pr-4">Mgr</th>
                <th className="py-2 pr-4">Comp</th>
                <th className="py-2 pr-4">KPI</th>
                <th className="py-2">รวม</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.cycle_id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">
                    {r.cycle?.name} ({r.cycle?.year})
                  </td>
                  <td className="py-2 pr-4">{formatScore(r.core_score)}</td>
                  <td className="py-2 pr-4">{formatScore(r.managerial_score)}</td>
                  <td className="py-2 pr-4">{formatScore(r.competency_score)}</td>
                  <td className="py-2 pr-4">{formatScore(r.kpi_score)}</td>
                  <td className="py-2 font-semibold">{formatScore(r.final_score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ScoreCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{formatScore(value)}</p>
    </div>
  )
}
