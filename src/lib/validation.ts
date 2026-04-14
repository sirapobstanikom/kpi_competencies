/** PostgREST จะตอบ 400 ถ้าใส่ค่าไม่ใช่ UUID ใน filter เช่น `id=eq....` */
export function isUuid(value: string | undefined | null): value is string {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
