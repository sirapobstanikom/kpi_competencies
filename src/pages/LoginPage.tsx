import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAuth } from '../context/AuthContext'

const schema = z.object({
  email: z.string().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(6, 'รหัสผ่านอย่างน้อย 6 ตัวอักษร'),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { session, signIn, loading } = useAuth()
  const loc = useLocation() as { state?: { from?: string } }
  const from = loc.state?.from ?? '/'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (!loading && session) {
    return <Navigate to={from === '/login' ? '/' : from} replace />
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">เข้าสู่ระบบ</h1>
        <p className="mt-1 text-sm text-slate-500">ใช้บัญชี Supabase Auth ขององค์กร</p>
        <form
          className="mt-6 space-y-4"
          onSubmit={handleSubmit(async (values) => {
            const { error } = await signIn(values.email, values.password)
            if (error) {
              toast.error(error.message)
              return
            }
            toast.success('เข้าสู่ระบบแล้ว')
          })}
        >
          <div>
            <label className="block text-sm font-medium text-slate-700">อีเมล</label>
            <input
              type="email"
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
              {...register('email')}
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">รหัสผ่าน</label>
            <input
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring-2"
              {...register('password')}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {isSubmitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  )
}
