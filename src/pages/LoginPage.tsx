import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import tcgLogo from '../assets/TCG.jpg'
import { useAuth } from '../context/AuthContext'

const schema = z.object({
  email: z.string().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(6, 'รหัสผ่านอย่างน้อย 6 ตัวอักษร'),
})

type FormValues = z.infer<typeof schema>

/* text-base + min-h-12: กันซูมอัตโนมัติบน iOS และพื้นที่แตะ ~48px */
const inputClass =
  'mt-2 block min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 shadow-sm transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 sm:min-h-11 sm:text-sm'

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
    <div className="relative min-h-dvh overflow-x-hidden overflow-y-auto bg-white supports-[min-height:100dvh]:min-h-[100dvh]">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-24 left-1/2 h-[min(480px,50vh)] w-[min(900px,120vw)] -translate-x-1/2 rounded-full bg-brand-500/12 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 translate-x-1/4 translate-y-1/4 rounded-full bg-brand-600/8 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%231a3668' fill-opacity='0.06'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* มือถือ: ฟอร์มก่อน (DOM ลำดับแรก) + flex-row-reverse บน desktop ให้หัวข้ออยู่ซ้าย */}
      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col gap-8 px-[max(1rem,env(safe-area-inset-left))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] supports-[min-height:100dvh]:min-h-[100dvh] sm:gap-10 sm:px-6 lg:flex-row-reverse lg:items-center lg:gap-12 lg:px-10 lg:py-12">
        <div className="w-full shrink-0 lg:w-[min(100%,420px)] lg:py-0">
          <div className="rounded-2xl border border-brand-100 bg-white p-6 shadow-lg shadow-brand-600/5 ring-1 ring-slate-100 sm:p-9 lg:rounded-3xl lg:shadow-xl">
            <div className="mb-6 flex flex-col items-center border-b border-slate-100 pb-6 sm:mb-8 sm:pb-8">
              <img
                src={tcgLogo}
                alt="โลโก้ TCG (Thai Credit Guarantee Corporation)"
                className="h-auto max-h-20 w-full max-w-[200px] object-contain sm:max-h-28 sm:max-w-[260px]"
                width={260}
                height={120}
                decoding="async"
              />
            </div>

            <h2 className="text-xl font-semibold text-brand-900 sm:text-lg">เข้าสู่ระบบ</h2>
            <p className="mt-1 text-base text-slate-600 sm:text-sm">ใช้บัญชีอีเมลที่องค์กรออกให้</p>

            <form
              className="mt-6 space-y-6 sm:mt-8 sm:space-y-5"
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
                <label htmlFor="login-email" className="text-base font-medium text-slate-800 sm:text-sm">
                  อีเมล
                </label>
                <input
                  id="login-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  className={inputClass}
                  placeholder="name@company.com"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="mt-2 text-sm font-medium text-red-600 sm:text-xs">{errors.email.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="login-password" className="text-base font-medium text-slate-800 sm:text-sm">
                  รหัสผ่าน
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  enterKeyHint="go"
                  className={inputClass}
                  placeholder="••••••••"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="mt-2 text-sm font-medium text-red-600 sm:text-xs">{errors.password.message}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="relative mt-1 flex min-h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 text-base font-semibold text-white shadow-md shadow-brand-600/20 transition active:scale-[0.98] hover:from-brand-700 hover:to-brand-500 hover:shadow-lg hover:shadow-brand-600/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:pointer-events-none disabled:opacity-55 sm:min-h-11 sm:text-sm"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="h-5 w-5 shrink-0 animate-spin sm:h-4 sm:w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    กำลังเข้าสู่ระบบ…
                  </span>
                ) : (
                  'เข้าสู่ระบบ'
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm leading-relaxed text-slate-500 sm:mt-8 sm:text-xs">
              หากลืมรหัสผ่าน ให้ติดต่อผู้ดูแลระบบขององค์กร
            </p>
          </div>
        </div>

        <header className="text-center max-lg:pb-2 lg:flex lg:flex-1 lg:items-center lg:pr-4 lg:text-left">
          <div className="lg:max-w-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500 sm:tracking-[0.2em]">
              ระบบประเมินผลการปฏิบัติงาน
            </p>
            <h1 className="mt-2 text-balance text-2xl font-bold leading-snug tracking-tight text-brand-900 sm:mt-3 sm:text-3xl lg:text-4xl">
              เข้าสู่ระบบเพื่อใช้งานภายในองค์กร
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-pretty text-base leading-relaxed text-slate-600 sm:mt-4 lg:mx-0">
              ใช้บัญชีอีเมลที่องค์กรออกให้เพื่อกรอกแบบประเมิน ติดตามรอบประเมิน และดูผลตามบทบาทของคุณ
            </p>
          </div>
        </header>
      </div>
    </div>
  )
}
