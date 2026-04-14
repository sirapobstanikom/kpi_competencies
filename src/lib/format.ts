export function formatScore(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return Number(v).toFixed(digits)
}

export function displayName(p: { first_name: string; last_name: string; email: string }): string {
  const n = `${p.first_name} ${p.last_name}`.trim()
  return n || p.email
}
