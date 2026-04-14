import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatScore } from '../../lib/format'
import { isUuid } from '../../lib/validation'
import type { EvaluationCycle, EvaluationResult } from '../../types/database'

type Row = EvaluationResult & { cycle?: Pick<EvaluationCycle, 'name' | 'year'> }

type CycleProgress = {
  cycleId: string
  name: string
  year: number
  expected: number
  submitted: number
  draft: number
  hasResult: boolean
}

export function EmployeeDashboardPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [progress, setProgress] = useState<CycleProgress[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.id) return
    void (async () => {
      const [{ data: res }, { data: evs }, { data: asg }] = await Promise.all([
        supabase
          .from('evaluation_results')
          .select('*')
          .eq('employee_id', profile.id)
          .order('computed_at', { ascending: false }),
        supabase.from('evaluations').select('cycle_id, status').eq('employee_id', profile.id),
        supabase.from('evaluator_assignments').select('cycle_id').eq('employee_id', profile.id),
      ])

      const resultCycleIds = new Set((res ?? []).map((r) => r.cycle_id))

      const assignCount = new Map<string, number>()
      for (const a of asg ?? []) {
        assignCount.set(a.cycle_id, (assignCount.get(a.cycle_id) ?? 0) + 1)
      }
      const submittedCount = new Map<string, number>()
      const draftCount = new Map<string, number>()
      for (const e of evs ?? []) {
        if (e.status === 'submitted') {
          submittedCount.set(e.cycle_id, (submittedCount.get(e.cycle_id) ?? 0) + 1)
        } else {
          draftCount.set(e.cycle_id, (draftCount.get(e.cycle_id) ?? 0) + 1)
        }
      }

      const evCountByCycle = new Map<string, number>()
      for (const e of evs ?? []) {
        evCountByCycle.set(e.cycle_id, (evCountByCycle.get(e.cycle_id) ?? 0) + 1)
      }

      const cycleIds = [
        ...new Set([
          ...resultCycleIds,
          ...assignCount.keys(),
          ...evCountByCycle.keys(),
        ]),
      ].filter(isUuid)

      const { data: cycles } = cycleIds.length
        ? await supabase.from('evaluation_cycles').select('id, name, year').in('id', cycleIds)
        : { data: [] as { id: string; name: string; year: number }[] }
      const cm = new Map((cycles ?? []).map((c) => [c.id, c]))

      const prog: CycleProgress[] = cycleIds.map((cycleId) => {
        const meta = cm.get(cycleId)
        const assigned = assignCount.get(cycleId) ?? 0
        const evTotal = evCountByCycle.get(cycleId) ?? 0
        const expected = assigned > 0 ? assigned : evTotal
        return {
          cycleId,
          name: meta?.name ?? 'รอบประเมิน',
          year: meta?.year ?? 0,
          expected,
          submitted: submittedCount.get(cycleId) ?? 0,
          draft: draftCount.get(cycleId) ?? 0,
          hasResult: resultCycleIds.has(cycleId),
        }
      })
      prog.sort((a, b) => b.year - a.year || b.name.localeCompare(a.name))
      setProgress(prog)

      const cids = [...new Set((res ?? []).map((r) => r.cycle_id).filter(isUuid))]
      const { data: cycleMeta } = cids.length
        ? await supabase.from('evaluation_cycles').select('id, name, year').in('id', cids)
        : { data: [] as { id: string; name: string; year: number }[] }
      const cmm = new Map((cycleMeta ?? []).map((c) => [c.id, c]))
      setRows(
        (res ?? []).map((r) => ({
          ...r,
          cycle: cmm.get(r.cycle_id),
        })),
      )
      setLoading(false)
    })()
  }, [profile?.id])

  if (loading) {
    return <div className="text-center text-slate-500">กำลังโหลด…</div>
  }

  const latest = rows[0]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">ผลประเมินของฉัน</h1>
        <p className="mt-1 text-sm text-slate-500">
          ผลรวมจะคำนวณเมื่อผู้ประเมินทุกคนในรอบนั้นกดส่งแบบครบ — ดูความคืบหน้าด้านล่าง
        </p>
      </div>

      {progress.length === 0 && rows.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-amber-50 p-5 text-sm text-amber-900">
          ยังไม่มีรอบประเมินหรือการมอบหมายที่เกี่ยวกับคุณในระบบ — ให้แอดมินเปิดรอบ (active) และมอบหมายผู้ประเมินให้คุณ
        </div>
      )}

      {progress.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">ความคืบหน้าตามรอบ</h2>
          <p className="mt-1 text-xs text-slate-500">
            ส่งแล้ว / จำนวนที่ต้องประเมิน — ถ้าครบแล้วจะมีแถว &quot;มีผลรวม&quot;
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4">รอบ</th>
                  <th className="py-2 pr-4">ส่งแล้ว / ทั้งหมด</th>
                  <th className="py-2 pr-4">ร่างค้าง</th>
                  <th className="py-2">ผลรวม</th>
                </tr>
              </thead>
              <tbody>
                {progress.map((p) => (
                  <tr key={p.cycleId} className="border-b border-slate-100">
                    <td className="py-2 pr-4">
                      {p.name} ({p.year})
                    </td>
                    <td className="py-2 pr-4">
                      {p.expected === 0 ? (
                        <span className="text-slate-400">ยังไม่มีการมอบหมาย</span>
                      ) : (
                        <span className="font-medium">
                          {p.submitted} / {p.expected}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{p.draft > 0 ? `${p.draft} แบบ` : '—'}</td>
                    <td className="py-2">
                      {p.hasResult ? (
                        <span className="font-medium text-emerald-700">มีผลรวมแล้ว</span>
                      ) : p.expected > 0 && p.submitted >= p.expected ? (
                        <span className="text-amber-700">รอคำนวณ</span>
                      ) : (
                        <span className="text-slate-500">รอส่งครบ</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm font-medium text-slate-700">ยังไม่มีผลคำนวณในระบบ</p>
          <p className="mt-2 text-sm text-slate-500">
            เมื่อทุกผู้ประเมินในรอบนั้นกด &quot;ส่งแบบประเมิน&quot; ครบ ระบบจะสร้างคะแนนรวมให้อัตโนมัติ
          </p>
        </div>
      ) : (
        <>
          <div>
            <p className="text-sm text-slate-500">
              รอบล่าสุดที่มีผลรวม: {latest?.cycle?.name} ({latest?.cycle?.year})
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ScoreCard label="Core (ถ่วงน้ำหนัก)" value={latest!.core_score} />
            <ScoreCard label="Managerial (ถ่วงน้ำหนัก)" value={latest!.managerial_score} />
            <ScoreCard label="Competency รวม" value={latest!.competency_score} />
            <ScoreCard label="KPI (ถ่วงน้ำหนัก)" value={latest!.kpi_score} />
            <ScoreCard label="KPI × 0.7" value={latest!.kpi_weighted} />
            <ScoreCard label="Competency × 0.3" value={latest!.competency_weighted} />
            <div className="rounded-xl border-2 border-brand-200 bg-brand-50 p-5 sm:col-span-2 lg:col-span-3">
              <p className="text-sm font-medium text-brand-800">คะแนนรวมสุดท้าย</p>
              <p className="mt-1 text-3xl font-bold text-brand-900">
                {formatScore(latest!.final_score)}
              </p>
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
        </>
      )}
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
