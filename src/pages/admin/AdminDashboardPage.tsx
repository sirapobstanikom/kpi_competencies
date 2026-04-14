import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { formatScore } from '../../lib/format'

type DeptAgg = { name: string; avg: number; count: number }

export function AdminDashboardPage() {
  const [employees, setEmployees] = useState(0)
  const [completion, setCompletion] = useState<{ done: number; total: number } | null>(null)
  const [avgFinal, setAvgFinal] = useState<number | null>(null)
  const [deptData, setDeptData] = useState<DeptAgg[]>([])
  const [cycleLabel, setCycleLabel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const { count: empCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })

      const { data: activeCycle } = await supabase
        .from('evaluation_cycles')
        .select('id, name, year')
        .eq('status', 'active')
        .maybeSingle()

      if (!activeCycle) {
        setEmployees(empCount ?? 0)
        setCompletion(null)
        setAvgFinal(null)
        setDeptData([])
        setCycleLabel(null)
        setLoading(false)
        return
      }

      setCycleLabel(`${activeCycle.name} (${activeCycle.year})`)

      const { data: evalRows } = await supabase
        .from('evaluations')
        .select('id, status')
        .eq('cycle_id', activeCycle.id)

      const total = evalRows?.length ?? 0
      const done = evalRows?.filter((e) => e.status === 'submitted').length ?? 0
      setCompletion({ done, total })

      const { data: results } = await supabase
        .from('evaluation_results')
        .select('final_score, employee_id')
        .eq('cycle_id', activeCycle.id)

      const finals = (results ?? []).map((r) => r.final_score).filter((x): x is number => x != null)
      setAvgFinal(
        finals.length ? finals.reduce((a, b) => a + b, 0) / finals.length : null,
      )

      const { data: profs } = await supabase.from('profiles').select('id, department_id')
      const { data: depts } = await supabase.from('departments').select('id, name')

      const deptName = new Map((depts ?? []).map((d) => [d.id, d.name]))
      const empDept = new Map((profs ?? []).map((p) => [p.id, p.department_id]))

      const bucket = new Map<string, { sum: number; n: number }>()
      for (const r of results ?? []) {
        if (r.final_score == null) continue
        const did = empDept.get(r.employee_id)
        const key = did ?? 'unknown'
        const cur = bucket.get(key) ?? { sum: 0, n: 0 }
        cur.sum += r.final_score
        cur.n += 1
        bucket.set(key, cur)
      }

      const chart: DeptAgg[] = [...bucket.entries()].map(([id, v]) => ({
        name: id === 'unknown' ? 'ไม่ระบุแผนก' : deptName.get(id) ?? 'ไม่ทราบแผนก',
        avg: v.n ? v.sum / v.n : 0,
        count: v.n,
      }))
      chart.sort((a, b) => b.avg - a.avg)
      setDeptData(chart)
      setEmployees(empCount ?? 0)
      setLoading(false)
    })()
  }, [])

  const completionPct = useMemo(() => {
    if (!completion || completion.total === 0) return null
    return Math.round((completion.done / completion.total) * 100)
  }, [completion])

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        กำลังโหลดแดชบอร์ด…
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">แดชบอร์ดองค์กร</h1>
        <p className="mt-1 text-sm text-slate-500">
          {cycleLabel
            ? `รอบประเมินที่ใช้: ${cycleLabel}`
            : 'ยังไม่มีรอบที่สถานะ active — ตั้งค่าได้ที่จัดการข้อมูลหลัก'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">จำนวนพนักงาน (โปรไฟล์)</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{employees}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">อัตราส่งแบบครบ (รอบ active)</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {completionPct === null ? '—' : `${completionPct}%`}
          </p>
          {completion && (
            <p className="mt-1 text-xs text-slate-400">
              {completion.done} / {completion.total} แบบ
            </p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">คะแนนรวมเฉลี่ย</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {formatScore(avgFinal)}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">คะแนนเฉลี่ยตามแผนก</h2>
        {deptData.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">ยังไม่มีผลคำนวณในรอบนี้</p>
        ) : (
          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={64} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [formatScore(typeof v === 'number' ? v : Number(v)), 'เฉลี่ย']}
                  labelFormatter={(_, p) => (p[0]?.payload as DeptAgg)?.name ?? ''}
                />
                <Bar dataKey="avg" fill="#2563eb" radius={[4, 4, 0, 0]} name="คะแนนเฉลี่ย" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
