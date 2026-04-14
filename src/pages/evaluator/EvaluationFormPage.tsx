import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { displayName } from '../../lib/format'

type Q = { id: string; type: string; question_text: string }
type K = { id: string; title: string }

export function EvaluationFormPage() {
  const { evaluationId } = useParams<{ evaluationId: string }>()
  const { profile } = useAuth()
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'draft' | 'submitted'>('draft')
  const [employeeLabel, setEmployeeLabel] = useState('')
  const [useMgr, setUseMgr] = useState(false)
  const [coreQ, setCoreQ] = useState<Q[]>([])
  const [mgrQ, setMgrQ] = useState<Q[]>([])
  const [kpis, setKpis] = useState<K[]>([])
  const [scores, setScores] = useState<Record<string, number | ''>>({})

  useEffect(() => {
    if (!evaluationId || !profile?.id) return
    void (async () => {
      setLoading(true)
      const { data: ev, error: evErr } = await supabase
        .from('evaluations')
        .select('*')
        .eq('id', evaluationId)
        .maybeSingle()
      if (evErr || !ev || ev.evaluator_id !== profile.id) {
        toast.error('ไม่พบแบบประเมินหรือไม่มีสิทธิ์')
        nav('/evaluator')
        return
      }
      setStatus(ev.status)

      const { data: emp } = await supabase.from('profiles').select('*').eq('id', ev.employee_id).maybeSingle()
      setEmployeeLabel(emp ? displayName(emp) : '')

      let managerial = false
      if (emp?.position_id) {
        const { data: pos } = await supabase
          .from('positions')
          .select('use_managerial_competency')
          .eq('id', emp.position_id)
          .maybeSingle()
        managerial = !!pos?.use_managerial_competency
      }
      setUseMgr(managerial)

      const { data: cq } = await supabase
        .from('competency_questions')
        .select('id, type, question_text')
        .eq('type', 'core')
        .order('sort_order')
      const { data: mq } = managerial
        ? await supabase
            .from('competency_questions')
            .select('id, type, question_text')
            .eq('type', 'managerial')
            .order('sort_order')
        : { data: [] as Q[] }
      const { data: ki } = await supabase.from('kpi_items').select('id, title').order('sort_order')

      setCoreQ(cq ?? [])
      setMgrQ(mq ?? [])
      setKpis(ki ?? [])

      const { data: ca } = await supabase
        .from('competency_answers')
        .select('question_id, score')
        .eq('evaluation_id', evaluationId)
      const { data: ka } = await supabase
        .from('kpi_answers')
        .select('kpi_id, score')
        .eq('evaluation_id', evaluationId)

      const m: Record<string, number | ''> = {}
      for (const r of ca ?? []) m[r.question_id] = Number(r.score)
      for (const r of ka ?? []) m[r.kpi_id] = Number(r.score)
      setScores(m)
      setLoading(false)
    })()
  }, [evaluationId, profile?.id, nav])

  const readonly = status === 'submitted'

  const allIds = useMemo(
    () => [...coreQ.map((q) => q.id), ...mgrQ.map((q) => q.id), ...kpis.map((k) => k.id)],
    [coreQ, mgrQ, kpis],
  )

  function setScore(id: string, v: string) {
    if (v === '') {
      setScores((s) => ({ ...s, [id]: '' }))
      return
    }
    const n = Number(v)
    if (Number.isNaN(n) || n < 0 || n > 5) return
    setScores((s) => ({ ...s, [id]: n }))
  }

  async function persistAnswers() {
    if (!evaluationId) return
    const compRows = [...coreQ, ...mgrQ]
      .map((q) => {
        const sc = scores[q.id]
        if (sc === '' || sc === undefined) return null
        return {
          evaluation_id: evaluationId,
          question_id: q.id,
          score: sc,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    const kpiRows = kpis
      .map((k) => {
        const sc = scores[k.id]
        if (sc === '' || sc === undefined) return null
        return {
          evaluation_id: evaluationId,
          kpi_id: k.id,
          score: sc,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    if (compRows.length) {
      const { error } = await supabase.from('competency_answers').upsert(compRows, {
        onConflict: 'evaluation_id,question_id',
      })
      if (error) throw error
    }
    if (kpiRows.length) {
      const { error } = await supabase.from('kpi_answers').upsert(kpiRows, {
        onConflict: 'evaluation_id,kpi_id',
      })
      if (error) throw error
    }
  }

  async function saveDraft() {
    if (readonly) return
    setSaving(true)
    try {
      await persistAnswers()
      toast.success('บันทึกร่างแล้ว')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
    setSaving(false)
  }

  async function submit() {
    if (readonly) return
    for (const id of allIds) {
      const sc = scores[id]
      if (sc === '' || sc === undefined) {
        toast.error('กรอกคะแนนให้ครบทุกข้อ (0–5)')
        return
      }
    }
    setSaving(true)
    try {
      await persistAnswers()
      const { error } = await supabase
        .from('evaluations')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', evaluationId!)
      if (error) throw error
      setStatus('submitted')
      toast.success('ส่งแบบประเมินแล้ว')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'ส่งไม่สำเร็จ')
    }
    setSaving(false)
  }

  if (loading) {
    return <div className="text-center text-slate-500">กำลังโหลดแบบประเมิน…</div>
  }

  function ScoreInput({ qid }: { qid: string }) {
    const v = scores[qid]
    return (
      <input
        type="number"
        min={0}
        max={5}
        step={0.01}
        disabled={readonly}
        className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm disabled:bg-slate-50"
        value={v === '' || v === undefined ? '' : v}
        onChange={(e) => setScore(qid, e.target.value)}
      />
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <button
          type="button"
          onClick={() => nav(-1)}
          className="text-sm text-brand-600 hover:underline"
        >
          ← กลับ
        </button>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">แบบประเมิน</h1>
        <p className="mt-1 text-sm text-slate-500">พนักงาน: {employeeLabel}</p>
        {readonly && (
          <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
            ส่งแล้ว — ดูอย่างเดียว
          </p>
        )}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Core Competency</h2>
        <p className="text-xs text-slate-500">คะแนนเต็มข้อละ 5</p>
        <ul className="mt-4 space-y-3">
          {coreQ.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-50 pb-3 last:border-0">
              <span className="text-sm text-slate-800">{q.question_text}</span>
              <ScoreInput qid={q.id} />
            </li>
          ))}
        </ul>
      </section>

      {useMgr && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Managerial Competency</h2>
          <ul className="mt-4 space-y-3">
            {mgrQ.map((q) => (
              <li
                key={q.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-50 pb-3 last:border-0"
              >
                <span className="text-sm text-slate-800">{q.question_text}</span>
                <ScoreInput qid={q.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">KPI</h2>
        <ul className="mt-4 space-y-3">
          {kpis.map((k) => (
            <li
              key={k.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-50 pb-3 last:border-0"
            >
              <span className="text-sm text-slate-800">{k.title}</span>
              <ScoreInput qid={k.id} />
            </li>
          ))}
        </ul>
      </section>

      {!readonly && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveDraft()}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            บันทึกร่าง
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            ส่งแบบประเมิน
          </button>
        </div>
      )}
    </div>
  )
}
