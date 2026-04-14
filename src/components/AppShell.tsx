import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { clsx } from 'clsx'

const navCls = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
  )

export function AppShell() {
  const { profile, signOut } = useAuth()
  const [evaluatorTaskCount, setEvaluatorTaskCount] = useState(0)

  useEffect(() => {
    if (!profile?.id) return
    void (async () => {
      const { count, error } = await supabase
        .from('evaluations')
        .select('id', { count: 'exact' })
        .eq('evaluator_id', profile.id)
        .limit(1)
      if (!error && count !== null) setEvaluatorTaskCount(count)
    })()
  }, [profile?.id])

  return (
    <div className="min-h-svh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="text-lg font-semibold text-slate-900">
            Employee Performance Evaluation
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {profile?.is_admin && (
              <>
                <NavLink to="/admin" className={navCls}>
                  แดชบอร์ดองค์กร
                </NavLink>
                <NavLink to="/admin/departments" className={navCls}>
                  แยกตามแผนก
                </NavLink>
                <NavLink to="/admin/assignments" className={navCls}>
                  มอบหมายผู้ประเมิน
                </NavLink>
                <NavLink to="/admin/master" className={navCls}>
                  จัดการข้อมูลหลัก
                </NavLink>
              </>
            )}
            {evaluatorTaskCount > 0 && (
              <NavLink to="/evaluator" className={navCls}>
                งานประเมิน ({evaluatorTaskCount})
              </NavLink>
            )}
            <NavLink to="/me" className={navCls}>
              ผลของฉัน
            </NavLink>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
