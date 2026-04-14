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
import type { EvaluatorGrade } from '../../types/database'

const GRADES: EvaluatorGrade[] = ['A', 'B+', 'B', 'C+', 'C']

type Q = { id: string; type: string; question_text: string }
type K = { id: string; title: string }

type LineItem = { key: string; text: string; qid: string }
const GROUP_CORE = 'group-core'
const GROUP_MANAGERIAL = 'group-managerial'
const GROUP_KPI = 'group-kpi'

function avgScore(values: number[]): number | '' {
  if (!values.length) return ''
  return normalizeScoreInput(values.reduce((a, b) => a + b, 0) / values.length)
}

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
  const [grade, setGrade] = useState<EvaluatorGrade | ''>('')
  const [cycle, setCycle] = useState<{
    end_date: string
    status: string
    name: string
  } | null>(null)

  const lineItems = useMemo((): LineItem[] => {
    const out: LineItem[] = [{ key: GROUP_CORE, text: 'Core Competency', qid: GROUP_CORE }]
    if (useMgr) out.push({ key: GROUP_MANAGERIAL, text: 'Managerial Competency', qid: GROUP_MANAGERIAL })
    out.push({ key: GROUP_KPI, text: 'KPI', qid: GROUP_KPI })
    return out
  }, [useMgr])

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
      const g = (ev as { grade?: EvaluatorGrade | null }).grade
      setGrade(g && GRADES.includes(g) ? g : '')

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

      const coreIds = new Set((cq ?? []).map((q) => q.id))
      const mgrIds = new Set((mq ?? []).map((q) => q.id))
      const coreScores: number[] = []
      const mgrScores: number[] = []
      for (const r of ca ?? []) {
        const n = normalizeScoreInput(Number(r.score))
        if (coreIds.has(r.question_id)) coreScores.push(n)
        if (mgrIds.has(r.question_id)) mgrScores.push(n)
      }
      const kpiScores: number[] = (ka ?? []).map((r) => normalizeScoreInput(Number(r.score)))

      const m: Record<string, number | ''> = {
        [GROUP_CORE]: avgScore(coreScores),
        [GROUP_KPI]: avgScore(kpiScores),
      }
      if (managerial) m[GROUP_MANAGERIAL] = avgScore(mgrScores)
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

  const allIds = useMemo(() => {
    const ids = [GROUP_CORE, GROUP_KPI]
    if (useMgr) ids.push(GROUP_MANAGERIAL)
    return ids
  }, [useMgr])

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
    const coreScore = scores[GROUP_CORE]
    const managerialScore = scores[GROUP_MANAGERIAL]
    const kpiScore = scores[GROUP_KPI]

    const compRows = [...coreQ, ...mgrQ]
      .map((q) => {
        const sc = q.type === 'core' ? coreScore : managerialScore
        if (sc === '' || sc === undefined || typeof sc !== 'number') return null
        return {
          evaluation_id: evaluationId,
          question_id: q.id,
          score: normalizeScoreInput(sc),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    const kpiRows = kpis
      .map((k) => {
        if (kpiScore === '' || kpiScore === undefined || typeof kpiScore !== 'number') return null
        return {
          evaluation_id: evaluationId,
          kpi_id: k.id,
          score: normalizeScoreInput(kpiScore),
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

  async function persistGrade() {
    if (!evaluationId) return
    const { error } = await supabase
      .from('evaluations')
      .update({ grade: grade === '' ? null : grade })
      .eq('id', evaluationId)
    if (error) throw error
  }

  async function saveDraft() {
    if (!canEditAnswers) return
    setSaving(true)
    try {
      await persistAnswers()
      await persistGrade()
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
    if (!grade) {
      toast.error('กรุณาเลือกเกรด (A, B+, B, C+, C) ก่อนส่งแบบ')
      return
    }
    setSaving(true)
    try {
      await persistAnswers()
      await persistGrade()
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
        className="min-h-12 w-28 rounded-lg border border-slate-200 px-3 py-2 text-base disabled:bg-slate-50 sm:min-h-0 sm:w-24 sm:py-1 sm:text-sm"
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

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-medium text-slate-800">รายการประเมิน</p>
        <p className="mt-1 text-xs text-slate-500">
          แสดงเฉพาะชื่อรายการประเมินหลัก ไม่มีข้อย่อย · ให้คะแนน {EVAL_SCORE_MIN}–{EVAL_SCORE_MAX}
          {useMgr ? '' : ' · ตำแหน่งนี้ไม่ใช้รายการ Managerial'}
        </p>
        <ul className="mt-5 space-y-4">
          {lineItems.map((item) => (
            <li
              key={item.key}
              className="flex flex-col gap-2 border-b border-slate-100 pb-4 last:border-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
            >
              <span className="min-w-0 flex-1 text-base text-slate-800 sm:text-sm">{item.text}</span>
              <ScoreInput qid={item.qid} />
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <label htmlFor="eval-grade" className="text-sm font-medium text-slate-800">
          เกรดที่ประเมิน
        </label>
        <p className="mt-1 text-xs text-slate-500">เลือกเกรดหนึ่งรายการ — จำเป็นตอนส่งแบบ (บันทึกร่างเก็บได้แม้ยังไม่เลือก)</p>
        <select
          id="eval-grade"
          disabled={readonly}
          value={grade}
          onChange={(e) => setGrade((e.target.value as EvaluatorGrade | '') || '')}
          className="mt-3 min-h-12 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-medium text-slate-900 disabled:bg-slate-50 sm:min-h-11 sm:text-sm"
        >
          <option value="">— เลือกเกรด —</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </section>

      {canEditAnswers && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveDraft()}
            className="min-h-12 rounded-lg border border-slate-200 px-4 text-base font-semibold text-slate-800 hover:bg-slate-50 sm:min-h-0 sm:text-sm"
          >
            {status === 'submitted' ? 'บันทึกการแก้ไข' : 'บันทึกร่าง'}
          </button>
          {status === 'draft' && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="min-h-12 rounded-lg bg-brand-600 px-4 text-base font-semibold text-white hover:bg-brand-700 sm:min-h-0 sm:text-sm"
            >
              ส่งแบบประเมิน
            </button>
          )}
        </div>
      )}
    </div>
  )
}
