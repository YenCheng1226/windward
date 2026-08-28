/**
 * Trip impact risk — one answer, assembled from the four things that actually
 * derail an offshore-island trip.
 *
 * The detailed panels each answer a narrow question well (can I dive at 10am? how
 * much do the models disagree?). None of them answers the question people actually
 * arrive with, which is "is this trip going to be ruined". That needs the four
 * strands combined, and combined the way the trip fails in practice:
 *
 *   - **The boat is a gate, not a factor.** If the ferry doesn't sail there is no
 *     trip, however perfect the sea is. It caps the day's risk from below.
 *   - **Activities degrade, they don't gate.** A day too rough to dive is still a
 *     day on the island, so poor conditions raise risk without maxing it.
 *   - **A tropical system is a multiplier on uncertainty**, not a direct hit — at
 *     500 km it brings swell and gusts long before it brings a warning.
 *   - **Rain and cloud are comfort**, weighted least; they change the day, not the plan.
 */
import type { DaySummary } from './trip'
import { ACTIVITIES } from './activities'
import type { Cyclone } from './tropical'

export type RiskLevel = '低' | '中' | '高' | '極高'

export interface RiskDriver {
  key: 'ferry' | 'sea' | 'wind' | 'weather' | 'tropical'
  label: string
  /** 0–100; the contribution this driver makes to the day's risk. */
  severity: number
  detail: string
}

export interface DayRisk {
  day: number
  level: RiskLevel
  /** 0–100. Higher is worse. */
  score: number
  drivers: RiskDriver[]
  /** The single driver doing the most damage. */
  dominant: RiskDriver | null
  /** Plain sentence a person can act on. */
  headline: string
  outOfRange: boolean
  /** Best activity score of the day, for the "can I still do anything" read. */
  bestActivity: { id: string; name: string; icon: string; score: number } | null
}

export interface TripRisk {
  days: DayRisk[]
  level: RiskLevel
  score: number
  headline: string
  summary: string
  /** What to do about it, in order. */
  actions: string[]
  /** Days with usable data. */
  usableDays: number
}

const levelOf = (score: number): RiskLevel => (score >= 75 ? '極高' : score >= 50 ? '高' : score >= 25 ? '中' : '低')

export const RISK_TONE: Record<RiskLevel, 'good' | 'warning' | 'critical'> = {
  低: 'good',
  中: 'warning',
  高: 'critical',
  極高: 'critical',
}

const FERRY_RISK: Record<string, number> = { 低: 5, 中: 35, 高: 75, 極高: 100, 無預報: 0 }

/** Distance to a cyclone, converted to an uncertainty premium rather than a direct hit. */
function tropicalSeverity(km: number): number {
  if (km <= 200) return 100
  if (km <= 400) return 75
  if (km <= 700) return 45
  if (km <= 1000) return 25
  if (km <= 1500) return 10
  return 0
}

function assessDay(d: DaySummary, cyclones: Cyclone[], outOfRange: boolean): DayRisk {
  if (outOfRange) {
    return {
      day: d.day,
      level: '低',
      score: 0,
      drivers: [],
      dominant: null,
      headline: '尚未進入預報範圍',
      outOfRange: true,
      bestActivity: null,
    }
  }

  const drivers: RiskDriver[] = []

  // Ferry — the gate.
  const ferrySev = FERRY_RISK[d.ferry.level] ?? 0
  if (d.ferry.level !== '無預報') {
    drivers.push({ key: 'ferry', label: '船班停航', severity: ferrySev, detail: d.ferry.reason })
  }

  // Sea state, read through the activities rather than raw wave height — the
  // thresholds that matter are already encoded there.
  const scores = d.cells.flatMap((c) => ACTIVITIES.filter((a) => a.id !== 'surf').map((a) => c.scores[a.id]?.score)).filter((s): s is number => s != null)
  const bestScore = scores.length ? Math.max(...scores) : null
  const seaSev = bestScore == null ? 0 : Math.max(0, 100 - bestScore)
  if (bestScore != null) {
    const waves = d.cells.map((c) => c.conditions.waveHeight).filter((v): v is number => v != null)
    drivers.push({
      key: 'sea',
      label: '海況不適合下水',
      severity: seaSev,
      detail: waves.length ? `全日最大浪高 ${Math.max(...waves).toFixed(1)} m，最好的活動時段只有 ${bestScore} 分` : `最好的活動時段只有 ${bestScore} 分`,
    })
  }

  // Wind, separately — it decides SUP and small-boat operations even when swell is low.
  const winds = d.cells.map((c) => c.conditions.windSpeed).filter((v): v is number => v != null)
  if (winds.length) {
    const w = Math.max(...winds)
    const windSev = w >= 14 ? 90 : w >= 11 ? 65 : w >= 8 ? 40 : w >= 6 ? 18 : 5
    drivers.push({ key: 'wind', label: '風勢', severity: windSev, detail: `全日最大風速 ${w.toFixed(1)} m/s` })
  }

  // Weather comfort — the lightest strand.
  if (d.comfort.score != null) {
    drivers.push({
      key: 'weather',
      label: '天氣舒適度',
      severity: Math.max(0, 100 - d.comfort.score) * 0.6,
      detail: d.stats.rainSum != null && d.stats.rainSum >= 1 ? `日雨量 ${d.stats.rainSum.toFixed(1)} mm，日照 ${d.sun.hours?.toFixed(1) ?? '—'} 小時` : `日照 ${d.sun.hours?.toFixed(1) ?? '—'} 小時，佔白天 ${d.sun.frac != null ? (d.sun.frac * 100).toFixed(0) : '—'}%`,
    })
  }

  // Tropical systems — nearest approach on this day, if any track reaches it.
  let nearest: { c: Cyclone; km: number } | null = null
  for (const c of cyclones) {
    for (const p of c.track) {
      if (!p.validTime) continue
      const pDay = Math.floor((p.validTime + 8 * 3600000) / 86400000) * 86400000
      if (pDay !== d.day) continue
      if (!nearest || p.distanceKm < nearest.km) nearest = { c, km: p.distanceKm }
    }
  }
  if (nearest) {
    drivers.push({
      key: 'tropical',
      label: '熱帶系統',
      severity: tropicalSeverity(nearest.km),
      detail: `${nearest.c.nameEn}（${nearest.c.cwaScale}）預報距此 ${Math.round(nearest.km).toLocaleString()} km`,
    })
  }

  drivers.sort((a, b) => b.severity - a.severity)
  const dominant = drivers[0] ?? null

  // The ferry gate: a day the boat can't sail is at least as bad as the ferry risk,
  // regardless of how pleasant the sea would have been.
  const weighted =
    drivers.reduce((sum, dr) => {
      const w = dr.key === 'ferry' ? 0.35 : dr.key === 'sea' ? 0.3 : dr.key === 'wind' ? 0.2 : dr.key === 'tropical' ? 0.1 : 0.05
      return sum + dr.severity * w
    }, 0) / drivers.reduce((sum, dr) => sum + (dr.key === 'ferry' ? 0.35 : dr.key === 'sea' ? 0.3 : dr.key === 'wind' ? 0.2 : dr.key === 'tropical' ? 0.1 : 0.05), 0)
  const score = Math.round(Math.max(weighted, ferrySev))

  const best = d.cells
    .flatMap((c) => ACTIVITIES.map((a) => ({ a, s: c.scores[a.id]?.score })))
    .filter((x): x is { a: (typeof ACTIVITIES)[number]; s: number } => x.s != null)
    .sort((x, y) => y.s - x.s)[0]

  const headline =
    score >= 75
      ? `${dominant?.label ?? '條件'}嚴重影響，這天很可能無法照計畫進行`
      : score >= 50
        ? `${dominant?.label ?? '條件'}影響明顯，需要備案`
        : score >= 25
          ? `${dominant?.label ?? '條件'}有影響，部分活動要調整`
          : '條件良好，照計畫走'

  return {
    day: d.day,
    level: levelOf(score),
    score,
    drivers,
    dominant,
    headline,
    outOfRange: false,
    bestActivity: best ? { id: best.a.id, name: best.a.name, icon: best.a.icon, score: best.s } : null,
  }
}

export function assessTrip(days: DaySummary[], cyclones: Cyclone[], outOfRange: (day: number) => boolean, leadDays: number, recheck: string): TripRisk {
  const dayRisks = days.map((d) => assessDay(d, cyclones, outOfRange(d.day)))
  const usable = dayRisks.filter((r) => !r.outOfRange)

  if (!usable.length) {
    return {
      days: dayRisks,
      level: '低',
      score: 0,
      headline: '還看不出來',
      summary: '整段行程都超出全球模式的 16 天預報範圍，現在沒有任何數字可以判斷。',
      actions: [`等行程進入 16 天預報範圍後再看`, `建議 ${recheck} 起每天確認一次`],
      usableDays: 0,
    }
  }

  // The trip's risk is driven by its worst days, not its average — one blown-out day
  // in the middle of four is what people actually remember and plan around.
  const sorted = [...usable].sort((a, b) => b.score - a.score)
  const score = Math.round(sorted[0].score * 0.6 + (sorted[1]?.score ?? sorted[0].score) * 0.25 + (usable.reduce((s, r) => s + r.score, 0) / usable.length) * 0.15)
  const level = levelOf(score)

  const bad = usable.filter((r) => r.score >= 50)
  const ok = usable.filter((r) => r.score < 25)

  const counts = new Map<string, number>()
  for (const r of usable) if (r.dominant) counts.set(r.dominant.label, (counts.get(r.dominant.label) ?? 0) + 1)
  const topDriver = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '海況'

  const headline =
    level === '極高' ? '這趟行程風險很高' : level === '高' ? '行程會受到明顯影響' : level === '中' ? '行程大致可行，但要有備案' : '行程條件良好'

  const summary =
    `${usable.length} 天可評估的日子裡，${bad.length} 天風險偏高、${ok.length} 天條件良好。` +
    `最主要的限制是${topDriver}。` +
    (leadDays > 7 ? `目前距出發還有 ${leadDays} 天，這個時距的預報一定會變，現在看的是趨勢不是結論。` : `距出發 ${leadDays} 天，預報開始穩定。`)

  const actions: string[] = []
  if (level === '極高' || level === '高') {
    actions.push('先擬備案：把水上活動改到條件最好的那個時段，其餘安排陸上行程')
    actions.push('出發前確認船班動態，離島行程的成敗先看船開不開')
  }
  if (bad.length > 0 && ok.length > 0) actions.push(`把主要的水上活動集中在風險低的日子`)
  actions.push(`${recheck}（出發前 4 天）重看一次，屆時海象模式才進入可信範圍`)
  actions.push('出發前一天再確認一次，並以中央氣象署的警特報為準')

  return { days: dayRisks, level, score, headline, summary, actions, usableDays: usable.length }
}
