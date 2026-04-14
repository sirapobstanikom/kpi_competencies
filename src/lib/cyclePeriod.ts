/** วันสิ้นสุดรอบเป็น YYYY-MM-DD — ถือว่าหมดเขตหลังจบวันสิ้นสุด (เที่ยงคืนตามเวลาเครื่องผู้ใช้) */
export function isPastCycleEndDate(endYmd: string): boolean {
  const parts = endYmd.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return true
  const [y, m, d] = parts
  const end = new Date(y, m - 1, d, 23, 59, 59, 999)
  return Date.now() > end.getTime()
}

export function formatCycleEndLabel(endYmd: string): string {
  try {
    const [y, m, d] = endYmd.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return endYmd
  }
}
