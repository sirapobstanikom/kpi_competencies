/** คะแนนแบบประเมิน: 1–5 ทศนิยมไม่เกิน 1 ตำแหน่ง */
export const EVAL_SCORE_MIN = 1
export const EVAL_SCORE_MAX = 5

export function roundScoreOneDecimal(n: number): number {
  return Math.round(n * 10) / 10
}

/** ค่าที่กรอกถูกต้องสำหรับส่งแบบ (อยู่ในช่วงและทศนิยมไม่เกิน 1 ตำแหน่ง) */
export function isValidSubmittedScore(n: number): boolean {
  if (!Number.isFinite(n) || n < EVAL_SCORE_MIN || n > EVAL_SCORE_MAX) return false
  const r = roundScoreOneDecimal(n)
  return Math.abs(n - r) < 1e-6
}

export function normalizeScoreInput(n: number): number {
  return roundScoreOneDecimal(
    Math.min(EVAL_SCORE_MAX, Math.max(EVAL_SCORE_MIN, n)),
  )
}
