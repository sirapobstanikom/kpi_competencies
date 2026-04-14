import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function AdminRoute() {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        กำลังโหลด…
      </div>
    )
  }

  if (!profile?.is_admin) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
