import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { clsx } from 'clsx'

const navCls = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-brand-50',
  )

const navClsMobile = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'flex min-h-12 w-full items-center rounded-xl px-4 text-base font-medium transition-colors sm:text-sm',
    isActive ? 'bg-brand-600 text-white' : 'text-slate-700 active:bg-brand-50',
  )

export function AppShell() {
  const { profile, signOut } = useAuth()
  const [evaluatorTaskCount, setEvaluatorTaskCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

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
    <div className="min-h-dvh bg-brand-50 supports-[min-height:100dvh]:min-h-[100dvh]">
      <header className="sticky top-0 z-40 border-b border-brand-100 bg-white/95 backdrop-blur-md">
        <div
          className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-[max(1rem,env(safe-area-inset-left))] py-3 pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4 sm:py-4"
        >
          <Link
            to="/"
            className="min-h-11 min-w-0 flex-1 py-2 text-left text-base font-semibold leading-snug text-brand-900 sm:text-lg"
          >
            Employee Performance Evaluation
          </Link>

          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-200 text-brand-800 lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="app-mobile-nav"
            aria-label={menuOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 6.75h16.5" />
              </svg>
            )}
          </button>

          <nav className="hidden flex-wrap items-center justify-end gap-2 lg:flex" aria-label="หลัก">
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
              className="rounded-lg border border-brand-200 px-3 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50"
            >
              ออกจากระบบ
            </button>
          </nav>
        </div>

        <div
          id="app-mobile-nav"
          className={clsx(
            'border-t border-brand-100 bg-white lg:hidden',
            menuOpen ? 'block' : 'hidden',
          )}
        >
          <nav
            className="mx-auto flex max-w-6xl flex-col gap-1 px-[max(1rem,env(safe-area-inset-left))] py-3 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))]"
            aria-label="หลัก (มือถือ)"
          >
            {profile?.is_admin && (
              <>
                <NavLink to="/admin" className={navClsMobile}>
                  แดชบอร์ดองค์กร
                </NavLink>
                <NavLink to="/admin/departments" className={navClsMobile}>
                  แยกตามแผนก
                </NavLink>
                <NavLink to="/admin/assignments" className={navClsMobile}>
                  มอบหมายผู้ประเมิน
                </NavLink>
                <NavLink to="/admin/master" className={navClsMobile}>
                  จัดการข้อมูลหลัก
                </NavLink>
              </>
            )}
            {evaluatorTaskCount > 0 && (
              <NavLink to="/evaluator" className={navClsMobile}>
                งานประเมิน ({evaluatorTaskCount})
              </NavLink>
            )}
            <NavLink to="/me" className={navClsMobile}>
              ผลของฉัน
            </NavLink>
            <button
              type="button"
              className="mt-1 flex min-h-12 w-full items-center justify-center rounded-xl border border-brand-200 text-base font-medium text-brand-800 active:bg-brand-50 sm:text-sm"
              onClick={() => {
                setMenuOpen(false)
                void signOut()
              }}
            >
              ออกจากระบบ
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-[max(1rem,env(safe-area-inset-left))] py-6 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-4 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}
