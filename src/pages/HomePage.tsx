import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useEffect, useState } from 'react'

export function HomePage() {
  const { profile, loading } = useAuth()
  const [evalCount, setEvalCount] = useState<number | null>(null)

  useEffect(() => {
    if (!profile?.id) return
    void (async () => {
      const { count } = await supabase
        .from('evaluations')
        .select('*', { count: 'exact', head: true })
        .eq('evaluator_id', profile.id)
      setEvalCount(count ?? 0)
    })()
  }, [profile?.id])

  if (loading || evalCount === null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        กำลังโหลด…
      </div>
    )
  }

  if (profile?.is_admin) return <Navigate to="/admin" replace />
  if (evalCount > 0) return <Navigate to="/evaluator" replace />
  return <Navigate to="/me" replace />
}
