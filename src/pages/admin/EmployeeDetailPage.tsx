import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { displayName, formatScore } from '../../lib/format'
import type { EvaluationCycle, EvaluationResult, Profile } from '../../types/database'

type Assignment = {
  id: string
  cycle_id: string
  evaluator_id: string
  weight: number
  cycle?: Pick<EvaluationCycle, 'name' | 'year'>
  evaluator?: Pick<Profile, 'first_name' | 'last_name' | 'email'>
}

export function EmployeeDetailPage() {
  const { employeeId } = useParams<{ employeeId: string }>()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [assigns, setAssigns] = useState<Assignment[]>([])
  const [results, setResults] = useState<(EvaluationResult & { cycle?: EvaluationCycle })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!employeeId) return
    void (async () => {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', employeeId).maybeSingle()
      setProfile(p)

      const { data: a } = await supabase
        .from('evaluator_assignments')
        .select('*')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false })

      const cids = [...new Set((a ?? []).map((x) => x.cycle_id))]
      const eids = [...new Set((a ?? []).map((x) => x.evaluator_id))]
      const [{ data: cycles }, { data: evals }] = await Promise.all([
        cids.length
          ? supabase.from('evaluation_cycles').select('id, name, year').in('id', cids)
          : Promise.resolve({ data: [] as { id: string; name: string; year: number }[] }),
        eids.length
          ? supabase.from('profiles').select('id, first_name, last_name, email').in('id', eids)
          : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string; email: string }[] }),
      ])
      const cm = new Map((cycles ?? []).map((c) => [c.id, c]))
      const em = new Map((evals ?? []).map((e) => [e.id, e]))
      setAssigns(
        (a ?? []).map((x) => ({
          ...x,
          weight: Number(x.weight),
          cycle: cm.get(x.cycle_id),
          evaluator: em.get(x.evaluator_id),
        })),
      )

      const { data: r } = await supabase
        .from('evaluation_results')
        .select('*')
        .eq('employee_id', employeeId)
        .order('computed_at', { ascending: false })
      const rcids = [...new Set((r ?? []).map((x) => x.cycle_id))]
      const { data: rc } = rcids.length
        ? await supabase.from('evaluation_cycles').select('*').in('id', rcids)
        : { data: [] as EvaluationCycle[] }
      const rcm = new Map((rc ?? []).map((c) => [c.id, c]))
      setResults((r ?? []).map((x) => ({ ...x, cycle: rcm.get(x.cycle_id) })))
      setLoading(false)
    })()
  }, [employeeId])

  if (loading) {
    return <div className="text-center text-slate-500">กำลังโหลด…</div>
  }

  if (!profile) {
    return <div className="text-center text-red-600">ไม่พบพนักงาน</div>
  }

  return (
    <div className="space-y-8">
      <div>
        <Link to="/admin/departments" className="text-sm text-brand-600 hover:underline">
          ← กลับแดชบอร์ดแผนก
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{displayName(profile)}</h1>
        <p className="text-sm text-slate-500">
          {profile.employee_code && `รหัส ${profile.employee_code} · `}
          {profile.email}
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">ผู้ประเมิน & น้ำหนัก</h2>
        {assigns.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">ยังไม่มีการมอบหมาย</p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-4">รอบ</th>
                <th className="py-2 pr-4">ผู้ประเมิน</th>
                <th className="py-2">Weight %</th>
              </tr>
            </thead>
            <tbody>
              {assigns.map((x) => (
                <tr key={x.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">
                    {x.cycle?.name} ({x.cycle?.year})
                  </td>
                  <td className="py-2 pr-4">
                    {x.evaluator
                      ? displayName({
                          first_name: x.evaluator.first_name,
                          last_name: x.evaluator.last_name,
                          email: x.evaluator.email,
                        })
                      : x.evaluator_id}
                  </td>
                  <td className="py-2">{x.weight}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">ประวัติผลรวม</h2>
        {results.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">ยังไม่มีผลคำนวณ</p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-4">รอบ</th>
                <th className="py-2 pr-4">Final</th>
                <th className="py-2 pr-4">KPI w</th>
                <th className="py-2">Comp w</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.cycle_id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">
                    {r.cycle?.name} ({r.cycle?.year})
                  </td>
                  <td className="py-2 pr-4 font-semibold">{formatScore(r.final_score)}</td>
                  <td className="py-2 pr-4">{formatScore(r.kpi_weighted)}</td>
                  <td className="py-2">{formatScore(r.competency_weighted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
