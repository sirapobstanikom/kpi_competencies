import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { displayName } from '../../lib/format'
import { isUuid } from '../../lib/validation'
import {
  EVAL_SCORE_MAX,
  EVAL_SCORE_MIN,
  isValidSubmittedScore,
  normalizeScoreInput,
} from '../../lib/evalScore'
import { formatCycleEndLabel, isPastCycleEndDate } from '../../lib/cyclePeriod'

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
  const [cycle, setCycle] = useState<{
    end_date: string
    status: string
    name: string
  } | null>(null)

  useEffect(() => {
    if (!evaluationId || !isUuid(evaluationId)) {
      setLoading(false)
      toast.error('ลิงก์ไม่ถูกต้อง')
      nav('/evaluator')
      return
    }
    if (!profile?.id) return
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

      const { data: cyc } = await supabase
        .from('evaluation_cycles')
        .select('end_date, status, name')
        .eq('id', ev.cycle_id)
        .maybeSingle()
      setCycle(cyc ?? null)

      const { data: emp } = isUuid(ev.employee_id)
        ? await supabase.from('profiles').select('*').eq('id', ev.employee_id).maybeSingle()
        : { data: null }
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
      for (const r of ca ?? []) m[r.question_id] = normalizeScoreInput(Number(r.score))
      for (const r of ka ?? []) m[r.kpi_id] = normalizeScoreInput(Number(r.score))
      setScores(m)
      setLoading(false)
    })()
  }, [evaluationId, profile?.id, nav])

  const canEditAnswers = useMemo(() => {
    if (!cycle) return false
    if (profile?.is_admin) return true
    if (cycle.status === 'closed') return false
    return !isPastCycleEndDate(cycle.end_date)
  }, [cycle, profile?.is_admin])

  const readonly = !canEditAnswers

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
    if (Number.isNaN(n)) return
    setScores((s) => ({ ...s, [id]: normalizeScoreInput(n) }))
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
          score: normalizeScoreInput(typeof sc === 'number' ? sc : Number(sc)),
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
          score: normalizeScoreInput(typeof sc === 'number' ? sc : Number(sc)),
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
    if (!canEditAnswers) return
    setSaving(true)
    try {
      await persistAnswers()
      toast.success(status === 'submitted' ? 'บันทึกการแก้ไขแล้ว' : 'บันทึกร่างแล้ว')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
    setSaving(false)
  }

  async function submit() {
    if (!canEditAnswers) return
    if (status !== 'draft') {
      toast.info('ส่งแบบแล้ว — ใช้ปุ่มบันทึกเพื่อแก้ไขคะแนนภายในวันสิ้นสุดรอบ')
      return
    }
    for (const id of allIds) {
      const sc = scores[id]
      if (sc === '' || sc === undefined) {
        toast.error(`กรอกคะแนนให้ครบทุกข้อ (${EVAL_SCORE_MIN}–${EVAL_SCORE_MAX})`)
        return
      }
      if (typeof sc !== 'number' || !isValidSubmittedScore(sc)) {
        toast.error(
          `คะแนนต้องอยู่ระหว่าง ${EVAL_SCORE_MIN}–${EVAL_SCORE_MAX} และทศนิยมไม่เกิน 1 ตำแหน่ง (เช่น 3.5)`,
        )
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
        min={EVAL_SCORE_MIN}
        max={EVAL_SCORE_MAX}
        step={0.1}
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
        {cycle && (
          <p className="mt-1 text-xs text-slate-500">
            รอบ: {cycle.name} · สิ้นสุด {formatCycleEndLabel(cycle.end_date)}
            {cycle.status === 'closed' ? ' · สถานะปิด' : ''}
          </p>
        )}
        {canEditAnswers && status === 'submitted' && cycle && (
          <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            ส่งแบบแล้ว — ยังแก้ไขคะแนนได้จนสิ้นวันที่{' '}
            <span className="font-semibold">{formatCycleEndLabel(cycle.end_date)}</span>{' '}
            (หรือจนกว่ารอบจะถูกตั้งเป็น &quot;ปิด&quot;)
          </p>
        )}
        {!canEditAnswers && cycle && (
          <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
            {cycle.status === 'closed'
              ? 'รอบประเมินนี้ถูกปิดแล้ว — ดูอย่างเดียว'
              : `หมดเขตแก้ไขแล้ว (สิ้นสุด ${formatCycleEndLabel(cycle.end_date)})`}
          </p>
        )}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Core Competency</h2>
        <p className="text-xs text-slate-500">
          คะแนน {EVAL_SCORE_MIN}–{EVAL_SCORE_MAX} ต่อข้อ (ทศนิยมได้ไม่เกิน 1 ตำแหน่ง เช่น 4.5)
        </p>
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
          <p className="text-xs text-slate-500">
            คะแนน {EVAL_SCORE_MIN}–{EVAL_SCORE_MAX} (ทศนิยม 1 ตำแหน่ง)
          </p>
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
        <p className="text-xs text-slate-500">
          คะแนน {EVAL_SCORE_MIN}–{EVAL_SCORE_MAX} (ทศนิยม 1 ตำแหน่ง)
        </p>
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

      {canEditAnswers && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveDraft()}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            {status === 'submitted' ? 'บันทึกการแก้ไข' : 'บันทึกร่าง'}
          </button>
          {status === 'draft' && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              ส่งแบบประเมิน
            </button>
          )}
        </div>
      )}
    </div>
  )
}
