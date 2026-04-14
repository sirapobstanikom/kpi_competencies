import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { displayName } from '../../lib/format'
import type {
  Department,
  EvaluationCycle,
  Position,
  Profile,
} from '../../types/database'

type Tab = 'cycles' | 'departments' | 'positions' | 'users'

export function MasterDataPage() {
  const [tab, setTab] = useState<Tab>('cycles')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">จัดการข้อมูลหลัก</h1>
        <p className="mt-1 text-sm text-slate-500">รอบประเมิน แผนก ตำแหน่ง และโปรไฟล์ผู้ใช้</p>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {(
          [
            ['cycles', 'รอบประเมิน'],
            ['departments', 'แผนก'],
            ['positions', 'ตำแหน่ง'],
            ['users', 'ผู้ใช้'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === k ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'cycles' && <CyclesSection />}
      {tab === 'departments' && <DepartmentsSection />}
      {tab === 'positions' && <PositionsSection />}
      {tab === 'users' && <UsersSection />}
    </div>
  )
}

function CyclesSection() {
  const [rows, setRows] = useState<EvaluationCycle[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '',
    year: new Date().getFullYear(),
    start_date: '',
    end_date: '',
    status: 'draft' as EvaluationCycle['status'],
  })

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('evaluation_cycles')
      .select('*')
      .order('year', { ascending: false })
    if (error) toast.error(error.message)
    else setRows(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function addCycle() {
    if (!form.name || !form.start_date || !form.end_date) {
      toast.error('กรอกข้อมูลให้ครบ')
      return
    }
    const { error } = await supabase.from('evaluation_cycles').insert({
      name: form.name,
      year: form.year,
      start_date: form.start_date,
      end_date: form.end_date,
      status: form.status,
    })
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('สร้างรอบแล้ว')
    setForm({
      name: '',
      year: new Date().getFullYear(),
      start_date: '',
      end_date: '',
      status: 'draft',
    })
    void load()
  }

  async function setStatus(id: string, status: EvaluationCycle['status']) {
    const { error } = await supabase.from('evaluation_cycles').update({ status }).eq('id', id)
    if (error) toast.error(error.message)
    else {
      toast.success('อัปเดตสถานะแล้ว')
      void load()
    }
  }

  if (loading) return <p className="text-slate-500">กำลังโหลด…</p>

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">สร้างรอบประเมิน</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="ชื่อรอบ"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            type="number"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={form.year}
            onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
          />
          <input
            type="date"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
          <input
            type="date"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as EvaluationCycle['status'] })
            }
          >
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="closed">closed</option>
          </select>
          <button
            type="button"
            onClick={() => void addCycle()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
          >
            เพิ่มรอบ
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">ชื่อ</th>
              <th className="px-3 py-2">ปี</th>
              <th className="px-3 py-2">ช่วง</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2">{r.year}</td>
                <td className="px-3 py-2 text-slate-600">
                  {r.start_date} → {r.end_date}
                </td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2 space-x-1">
                  {r.status !== 'active' && (
                    <button
                      type="button"
                      className="text-xs text-brand-600 hover:underline"
                      onClick={() => void setStatus(r.id, 'active')}
                    >
                      ตั้ง active
                    </button>
                  )}
                  {r.status !== 'closed' && (
                    <button
                      type="button"
                      className="text-xs text-slate-600 hover:underline"
                      onClick={() => void setStatus(r.id, 'closed')}
                    >
                      ปิด
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DepartmentsSection() {
  const [rows, setRows] = useState<Department[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  async function load() {
    const { data } = await supabase.from('departments').select('*').order('name')
    setRows(data ?? [])
  }

  useEffect(() => {
    void load()
  }, [])

  async function add() {
    if (!name || !code) return
    const { error } = await supabase.from('departments').insert({ name, code })
    if (error) toast.error(error.message)
    else {
      toast.success('เพิ่มแผนกแล้ว')
      setName('')
      setCode('')
      void load()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <input
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="ชื่อแผนก"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="รหัส"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button
          type="button"
          onClick={() => void add()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
        >
          เพิ่ม
        </button>
      </div>
      <ul className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {rows.map((d) => (
          <li key={d.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>
              {d.name} <span className="text-slate-400">({d.code})</span>
            </span>
            <button
              type="button"
              className="text-xs text-red-600"
              onClick={async () => {
                const { error } = await supabase.from('departments').delete().eq('id', d.id)
                if (error) toast.error(error.message)
                else void load()
              }}
            >
              ลบ
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PositionsSection() {
  const [rows, setRows] = useState<Position[]>([])
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [useMgr, setUseMgr] = useState(false)

  async function load() {
    const { data } = await supabase.from('positions').select('*').order('level', { ascending: false })
    setRows(data ?? [])
  }

  useEffect(() => {
    void load()
  }, [])

  async function add() {
    if (!name || !code) return
    const { error } = await supabase
      .from('positions')
      .insert({ name, code, use_managerial_competency: useMgr })
    if (error) toast.error(error.message)
    else {
      toast.success('เพิ่มตำแหน่งแล้ว')
      setName('')
      setCode('')
      setUseMgr(false)
      void load()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <input
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="ชื่อตำแหน่ง"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="รหัส"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={useMgr} onChange={(e) => setUseMgr(e.target.checked)} />
          ใช้ Managerial competency
        </label>
        <button
          type="button"
          onClick={() => void add()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
        >
          เพิ่ม
        </button>
      </div>
      <ul className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {rows.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>
              {p.name}{' '}
              <span className="text-slate-400">
                ({p.code}) {p.use_managerial_competency ? '· Mgr' : ''}
              </span>
            </span>
            <button
              type="button"
              className="text-xs text-red-600"
              onClick={async () => {
                const { error } = await supabase.from('positions').delete().eq('id', p.id)
                if (error) toast.error(error.message)
                else void load()
              }}
            >
              ลบ
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function UsersSection() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [depts, setDepts] = useState<Department[]>([])
  const [pos, setPos] = useState<Position[]>([])

  async function load() {
    const [a, b, c] = await Promise.all([
      supabase.from('profiles').select('*').order('email'),
      supabase.from('departments').select('*').order('name'),
      supabase.from('positions').select('*').order('name'),
    ])
    setProfiles(a.data ?? [])
    setDepts(b.data ?? [])
    setPos(c.data ?? [])
  }

  useEffect(() => {
    void load()
  }, [])

  async function updateUser(p: Profile, patch: Partial<Profile>) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', p.id)
    if (error) toast.error(error.message)
    else {
      toast.success('บันทึกแล้ว')
      void load()
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">ผู้ใช้</th>
            <th className="px-3 py-2">รหัสพนักงาน</th>
            <th className="px-3 py-2">แผนก</th>
            <th className="px-3 py-2">ตำแหน่ง</th>
            <th className="px-3 py-2">Admin</th>
            <th className="px-3 py-2">รายละเอียด</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => (
            <tr key={p.id} className="border-b border-slate-100">
              <td className="px-3 py-2">
                <div className="font-medium">{displayName(p)}</div>
                <div className="text-xs text-slate-500">{p.email}</div>
              </td>
              <td className="px-3 py-2">
                <input
                  className="w-24 rounded border border-slate-200 px-2 py-1 text-xs"
                  defaultValue={p.employee_code ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null
                    if (v !== (p.employee_code ?? '')) void updateUser(p, { employee_code: v })
                  }}
                />
              </td>
              <td className="px-3 py-2">
                <select
                  className="max-w-[160px] rounded border border-slate-200 px-2 py-1 text-xs"
                  value={p.department_id ?? ''}
                  onChange={(e) =>
                    void updateUser(p, {
                      department_id: e.target.value || null,
                    })
                  }
                >
                  <option value="">—</option>
                  {depts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2">
                <select
                  className="max-w-[160px] rounded border border-slate-200 px-2 py-1 text-xs"
                  value={p.position_id ?? ''}
                  onChange={(e) =>
                    void updateUser(p, {
                      position_id: e.target.value || null,
                    })
                  }
                >
                  <option value="">—</option>
                  {pos.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={p.is_admin}
                  onChange={(e) => void updateUser(p, { is_admin: e.target.checked })}
                />
              </td>
              <td className="px-3 py-2">
                <Link
                  to={`/admin/employees/${p.id}`}
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  ดู
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
