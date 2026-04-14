import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { displayName } from '../../lib/format'
import type { EvaluationCycle, Profile } from '../../types/database'

type Row = { evaluator_id: string; weight: number }

export function AssignmentPage() {
  const [cycles, setCycles] = useState<EvaluationCycle[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [cycleId, setCycleId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [rows, setRows] = useState<Row[]>([{ evaluator_id: '', weight: 0 }])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void (async () => {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from('evaluation_cycles').select('*').order('year', { ascending: false }),
        supabase.from('profiles').select('*').order('first_name'),
      ])
      setCycles(c ?? [])
      setProfiles(p ?? [])
      if (c?.[0]) setCycleId(c[0].id)
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    if (!cycleId || !employeeId) return
    void (async () => {
      const { data } = await supabase
        .from('evaluator_assignments')
        .select('evaluator_id, weight')
        .eq('cycle_id', cycleId)
        .eq('employee_id', employeeId)
      if (data?.length) {
        setRows(data.map((d) => ({ evaluator_id: d.evaluator_id, weight: Number(d.weight) })))
      } else {
        setRows([{ evaluator_id: '', weight: 0 }])
      }
    })()
  }, [cycleId, employeeId])

  const sum = useMemo(() => rows.reduce((a, r) => a + (Number(r.weight) || 0), 0), [rows])

  const profileOptions = useMemo(
    () => profiles.filter((p) => p.id !== employeeId),
    [profiles, employeeId],
  )

  async function save() {
    if (!cycleId || !employeeId) {
      toast.error('เลือกรอบและพนักงานผู้ถูกประเมิน')
      return
    }
    const clean = rows.filter((r) => r.evaluator_id)
    if (clean.length === 0) {
      toast.error('เพิ่มผู้ประเมินอย่างน้อย 1 คน หรือล้างมอบหมายทั้งหมดด้วยการส่งค่าว่าง')
      return
    }
    if (Math.abs(sum - 100) > 0.001) {
      toast.error(`ผลรวม weight ต้องเท่ากับ 100% (ปัจจุบัน ${sum})`)
      return
    }
    setSaving(true)
    const { error } = await supabase.rpc('replace_evaluator_assignments', {
      p_cycle_id: cycleId,
      p_employee_id: employeeId,
      p_rows: clean.map((r) => ({ evaluator_id: r.evaluator_id, weight: r.weight })),
    })
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('บันทึกการมอบหมายแล้ว')
  }

  async function clearAssignments() {
    if (!cycleId || !employeeId) return
    if (!confirm('ล้างการมอบหมายทั้งหมดสำหรับพนักงานนี้ในรอบนี้?')) return
    setSaving(true)
    const { error } = await supabase.rpc('replace_evaluator_assignments', {
      p_cycle_id: cycleId,
      p_employee_id: employeeId,
      p_rows: [],
    })
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setRows([{ evaluator_id: '', weight: 0 }])
    toast.success('ล้างการมอบหมายแล้ว')
  }

  if (loading) return <div className="text-center text-slate-500">กำลังโหลด…</div>

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">มอบหมายผู้ประเมิน</h1>
        <p className="mt-1 text-sm text-slate-500">
          กำหนดผู้ประเมินและ weight ให้ครบ 100% — ระบบจะสร้างแบบร่างการประเมินอัตโนมัติ
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">รอบประเมิน</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={cycleId}
              onChange={(e) => setCycleId(e.target.value)}
            >
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.year}) — {c.status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">พนักงาน (ผู้ถูกประเมิน)</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">— เลือก —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {displayName(p)} {p.employee_code ? `(${p.employee_code})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">ผู้ประเมิน & น้ำหนัก (%)</span>
            <span
              className={`text-sm font-semibold ${Math.abs(sum - 100) < 0.001 ? 'text-emerald-600' : 'text-amber-600'}`}
            >
              รวม {sum}% / 100%
            </span>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <select
                  className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={r.evaluator_id}
                  onChange={(e) => {
                    const next = [...rows]
                    next[i] = { ...next[i], evaluator_id: e.target.value }
                    setRows(next)
                  }}
                >
                  <option value="">— ผู้ประเมิน —</option>
                  {profileOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {displayName(p)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={r.weight || ''}
                  onChange={(e) => {
                    const next = [...rows]
                    next[i] = { ...next[i], weight: Number(e.target.value) }
                    setRows(next)
                  }}
                />
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-2 py-2 text-sm text-red-600 hover:bg-red-50"
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                >
                  ลบ
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-brand-600 hover:underline"
            onClick={() => setRows([...rows, { evaluator_id: '', weight: 0 }])}
          >
            + เพิ่มผู้ประเมิน
          </button>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            บันทึก
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void clearAssignments()}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ล้างมอบหมาย
          </button>
        </div>
      </div>
    </div>
  )
}
