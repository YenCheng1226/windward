/**
 * Trip impact assessment, expressed as reasoning rather than a score.
 *
 * An earlier version reduced each day to 0–100. That number was unusable: it said
 * nothing about *why* a day was bad, what would change it, or how much to trust it —
 * and a single figure invites false precision on a forecast whose inputs disagree by
 * a factor of two. This version reports the same underlying analysis as claims,
 * evidence and stated confidence, which is what someone planning a trip can act on.
 *
 * Severity still exists internally, to rank and order — it is simply never the answer.
 */
import type { DaySummary } from './trip'
import { ACTIVITIES } from './activities'
import type { Cyclone } from './tropical'

/** Categorical, not numeric — the reader is meant to think in these terms. */
export type Status = 'ok' | 'caution' | 'poor' | 'blocked'

export const STATUS_LABEL: Record<Status, string> = {
  ok: '照計畫可行',
  caution: '需要調整',
  poor: '多數活動不可行',
  blocked: '可能去不了',
}

export const STATUS_TONE: Record<Status, 'good' | 'warning' | 'critical'> = {
  ok: 'good',
  caution: 'warning',
  poor: 'critical',
  blocked: 'critical',
}

export type Confidence = '高' | '中' | '低'

export interface Reason {
  /** What is the case, in plain words. */
  claim: string
  /** The measurements behind the claim, including the threshold it is judged against. */
  evidence: string
  confidence: Confidence
  /** Why the confidence is what it is — never left implicit. */
  basis: string
}

export interface DayAssessment {
  day: number
  status: Status
  /** Headline for the day: what actually happens. */
  verdict: string
  reasons: Reason[]
  /** The concrete thing that would flip this day's verdict. */
  wouldChange: string
  outOfRange: boolean
  entersRange: string | null
  /** Best activity that still works, if any. */
  stillWorks: string | null
}

export interface UncertaintyFactor {
  label: string
  detail: string
  /** How much this factor undermines the assessment. */
  weight: Confidence
}

export interface TripAssessment {
  /** One sentence a person can repeat to their travel companions. */
  conclusion: string
  /** The causal chain, in order. */
  reasoning: string[]
  days: DayAssessment[]
  uncertainty: {
    level: Confidence
    statement: string
    factors: UncertaintyFactor[]
  }
  actions: string[]
  decisionPoint: string
  usableDays: number
}

/** Thresholds quoted in the evidence, so the reader can disagree with them. */
const FERRY_SUSPEND_WAVE = 2.5
const FERRY_ROUGH_WAVE = 1.8
const DIVE_LIMIT_WAVE = 1.5

const dayLabel = (ms: number) => `${new Date(ms).getUTCMonth() + 1}/${new Date(ms).getUTCDate()}`

const severityOf = (s: Status) => ({ ok: 0, caution: 1, poor: 2, blocked: 3 })[s]

function assessDay(d: DaySummary, cyclones: Cyclone[], outOfRange: boolean, entersRange: string | null): DayAssessment {
  if (outOfRange) {
    return {
      day: d.day,
      status: 'ok',
      verdict: '尚未進入預報範圍',
      reasons: [],
      wouldChange: entersRange ? `${entersRange} 起會有第一版預報` : '',
      outOfRange: true,
      entersRange,
      stillWorks: null,
    }
  }

  const reasons: Reason[] = []
  const waves = d.cells.map((c) => c.conditions.waveHeight).filter((v): v is number => v != null)
  const waveMax = waves.length ? Math.max(...waves) : null
  const winds = d.cells.map((c) => c.conditions.windSpeed).filter((v): v is number => v != null)
  const windMax = winds.length ? Math.max(...winds) : null
  const waveSpread = Math.max(0, ...d.cells.map((c) => c.waveSpread ?? 0))
  const windSpread = Math.max(0, ...d.cells.map((c) => c.windSpread ?? 0))
  const modelWindMinAll = d.cells.map((c) => c.windMin).filter((v): v is number => v != null)
  const modelWindMin = modelWindMinAll.length ? Math.min(...modelWindMinAll) : null
  const modelWindMaxAll = d.cells.map((c) => c.windMax).filter((v): v is number => v != null)
  const modelWindMax = modelWindMaxAll.length ? Math.max(...modelWindMaxAll) : null
  // A spread of 0.00 m means agreement only if two models actually reported.
  const waveModels = Math.max(0, ...d.cells.map((c) => c.waveModels))

  // Ferry — the gate. Stated first because nothing else matters if it fails.
  if (waveMax != null) {
    if (waveMax >= FERRY_SUSPEND_WAVE) {
      reasons.push({
        claim: '船班可能停航',
        evidence: `全日最大浪高 ${waveMax.toFixed(1)} m，超過這條航線常見的停航海況（約 ${FERRY_SUSPEND_WAVE} m）${d.gustMax != null ? `；最大陣風 ${d.gustMax.toFixed(0)} m/s` : ''}`,
        confidence: waveModels < 2 ? '低' : waveSpread <= 0.4 ? '中' : '低',
        basis:
          waveModels < 2
            ? '這天只有一家波浪模式有資料，沒有第二個意見可以對照；且停航門檻是經驗值，不是船公司標準'
            : `兩家波浪模式在這天相差 ${waveSpread.toFixed(2)} m，${waveSpread <= 0.4 ? '算是接近' : '差距不小'}；且停航門檻是經驗值，不是船公司標準`,
      })
    } else if (waveMax >= FERRY_ROUGH_WAVE) {
      reasons.push({
        claim: '船會晃，容易暈船但通常照開',
        evidence: `全日最大浪高 ${waveMax.toFixed(1)} m，介於「明顯搖晃」（${FERRY_ROUGH_WAVE} m）與「常見停航」（${FERRY_SUSPEND_WAVE} m）之間`,
        confidence: waveModels < 2 ? '低' : waveSpread <= 0.4 ? '中' : '低',
        basis: waveModels < 2 ? '這天只有一家波浪模式有資料' : `兩家波浪模式相差 ${waveSpread.toFixed(2)} m`,
      })
    }
  }

  // Water activities, judged against the thresholds already encoded in ACTIVITIES.
  const diveScores = d.cells.flatMap((c) =>
    ACTIVITIES.filter((a) => a.id !== 'surf').map((a) => ({ a, s: c.scores[a.id]?.score ?? null, part: String(c.part.label) })),
  )
  const scored = diveScores.filter((x) => x.s != null) as { a: (typeof ACTIVITIES)[number]; s: number; part: string }[]
  const viable = scored.filter((x) => x.s >= 55)
  const bestDive = [...scored].sort((x, y) => y.s - x.s)[0]

  if (waveMax != null && bestDive) {
    if (viable.length === 0) {
      reasons.push({
        claim: '潛水與浮潛整天都不可行',
        evidence: `全日最大浪高 ${waveMax.toFixed(1)} m，已超過水肺潛水的可行上限（${DIVE_LIMIT_WAVE} m）；表現最好的是${bestDive.part}的${bestDive.a.name}，也只有 ${bestDive.s} 分`,
        confidence: waveModels < 2 ? '低' : waveSpread <= 0.4 ? '中' : '低',
        basis: `門檻取自潛店與業者的通用說法，未針對特定潛點校正；${waveModels < 2 ? '且這天只有一家波浪模式有資料' : `波浪模式間相差 ${waveSpread.toFixed(2)} m`}`,
      })
    } else if (viable.length < diveScores.length / 2) {
      const best = [...viable].sort((x, y) => y.s - x.s)[0]
      reasons.push({
        claim: '只有部分時段適合下水',
        evidence: `全日最大浪高 ${waveMax.toFixed(1)} m；${best.part}的${best.a.name}有 ${best.s} 分，其餘時段偏低`,
        confidence: '中',
        basis: `浪高在門檻附近，模式相差 ${waveSpread.toFixed(2)} m 就足以改變結論`,
      })
    }
  }

  // Wind, with the ensemble's own agreement quoted rather than asserted.
  if (windMax != null && windMax >= 8) {
    const probs = d.cells.map((c) => c.windProb.scuba).filter((v): v is number => v != null)
    const prob = probs.length ? Math.min(...probs) : null
    reasons.push({
      claim: windMax >= 12 ? '風勢過強，小船作業與 SUP 都會受限' : '風偏強，SUP 與自由潛水的水面條件會變差',
      evidence: `全日最大風速 ${windMax.toFixed(1)} m/s${
        windSpread >= 3 && modelWindMin != null && modelWindMax != null
          ? `（各家模式在 ${modelWindMin.toFixed(1)}–${modelWindMax.toFixed(1)} m/s 之間）`
          : ''
      }`,
      confidence: prob == null ? '低' : windSpread >= 5 ? '低' : '中',
      basis:
        prob != null
          ? `系集中有 ${prob.toFixed(0)}% 的成員風速維持在水肺潛水的可行上限內——比例越高代表越可能其實還好`
          : '此時段超出系集時距，沒有機率可以佐證',
    })
  }

  // Weather comfort, only when it actually matters.
  const rain = d.stats.rainSum
  if (rain != null && rain >= 5) {
    reasons.push({
      claim: '降雨會打斷岸上行程',
      evidence: `日累積雨量 ${rain.toFixed(1)} mm${d.stats.rainHours ? `，其中 ${d.stats.rainHours} 小時有明顯降雨` : ''}`,
      confidence: '中',
      basis: '降雨的空間變化大，島嶼尺度的實際落點模式抓不準',
    })
  }
  if (d.sun.frac != null) {
    const spread = d.sun.min != null && d.sun.max != null ? d.sun.max - d.sun.min : 0
    if (spread >= 4) {
      reasons.push({
        claim: '有沒有太陽現在說不準',
        evidence: `${d.sun.models} 家模式給出 ${d.sun.min!.toFixed(1)}–${d.sun.max!.toFixed(1)} 小時日照，中位數 ${d.sun.hours!.toFixed(1)} 小時`,
        confidence: '低',
        basis: `差距 ${spread.toFixed(1)} 小時，等於「整天沒太陽」到「幾乎全晴」都在射程內`,
      })
    }
  }

  // Tropical systems reaching this day on their forecast track.
  let nearest: { c: Cyclone; km: number } | null = null
  for (const c of cyclones) {
    for (const p of c.track) {
      if (!p.validTime) continue
      const pDay = Math.floor((p.validTime + 8 * 3600000) / 86400000) * 86400000
      if (pDay !== d.day) continue
      if (!nearest || p.distanceKm < nearest.km) nearest = { c, km: p.distanceKm }
    }
  }
  if (nearest && nearest.km <= 1000) {
    reasons.push({
      claim: '有熱帶系統在影響範圍內',
      evidence: `${nearest.c.nameEn}（${nearest.c.cwaScale}）預報距此 ${Math.round(nearest.km).toLocaleString()} km`,
      confidence: '中',
      basis: '颱風路徑預報 3 天內誤差約百公里等級，越往後誤差越大；外圍長浪的影響範圍遠大於中心距離',
    })
  }

  // Status from what the reasons say, not from arithmetic.
  const blocked = reasons.some((r) => r.claim === '船班可能停航')
  const poor = reasons.some((r) => r.claim === '潛水與浮潛整天都不可行')
  const caution = reasons.length > 0
  const status: Status = blocked ? 'blocked' : poor ? 'poor' : caution ? 'caution' : 'ok'

  const verdict = blocked
    ? '船可能開不了，這天要有去不成的準備'
    : poor
      ? '到得了島上，但整天不適合下水'
      : caution
        ? '可以玩，但要挑時段或換項目'
        : '條件良好，照計畫走'

  const surfAll = d.cells.map((c) => ({ s: c.scores.surf?.score ?? null, part: String(c.part.label) }))
  const surf = (surfAll.filter((x) => x.s != null) as { s: number; part: string }[]).sort((x, y) => y.s - x.s)[0]
  const stillWorks =
    bestDive && bestDive.s >= 55
      ? `${bestDive.part}的${bestDive.a.name}（${bestDive.s} 分）`
      : surf && surf.s >= 55
        ? `${surf.part}的衝浪（${surf.s} 分）——浪大反而是它的條件`
        : null

  const wouldChange = blocked
    ? `浪高降到 ${FERRY_SUSPEND_WAVE} m 以下，船班就恢復正常機率`
    : poor
      ? `浪高降到 ${DIVE_LIMIT_WAVE} m 以下，水肺潛水就重新可行`
      : caution
        ? '風或浪再降一級，多數時段就會回到舒適區間'
        : '除非預報大幅改變，否則維持'

  return { day: d.day, status, verdict, reasons, wouldChange, outOfRange: false, entersRange: null, stillWorks }
}

export function assessTrip(
  days: DaySummary[],
  cyclones: Cyclone[],
  outOfRange: (day: number) => boolean,
  entersRangeLabel: (day: number) => string,
  leadDays: number,
  recheck: string,
  waveSpreadMax: number | null,
  marineCovered: boolean,
): TripAssessment {
  const assessments = days.map((d) => assessDay(d, cyclones, outOfRange(d.day), outOfRange(d.day) ? entersRangeLabel(d.day) : null))
  const usable = assessments.filter((a) => !a.outOfRange)

  const blocked = usable.filter((a) => a.status === 'blocked')
  const poor = usable.filter((a) => a.status === 'poor')
  const fine = usable.filter((a) => a.status === 'ok')

  // ---- uncertainty, stated before any conclusion leans on it
  const factors: UncertaintyFactor[] = []
  if (leadDays > 10) {
    factors.push({ label: '預報時距', detail: `距出發還有 ${leadDays} 天。十天以外的預報每天都會改，昨天這幾天還是「風平浪靜、陽光充足」。`, weight: '低' })
  } else if (leadDays > 5) {
    factors.push({ label: '預報時距', detail: `距出發 ${leadDays} 天，大方向開始穩定，細節仍會變動。`, weight: '中' })
  } else {
    factors.push({ label: '預報時距', detail: `距出發 ${leadDays} 天，預報已進入相對可信的範圍。`, weight: '高' })
  }
  if (waveSpreadMax != null) {
    factors.push({
      label: '浪高',
      detail: `兩家波浪模式在行程期間最大相差 ${waveSpreadMax.toFixed(2)} m。這個海域沒有公開的波浪系集，只能用模式差異估計不確定性，會低估真實範圍。`,
      weight: waveSpreadMax <= 0.3 ? '中' : '低',
    })
  }
  if (!marineCovered) {
    factors.push({ label: '海象涵蓋', detail: '行程尾端超出波浪模式時距，那幾天的浪高沒有資料——不是「沒浪」，是還沒有預報。', weight: '低' })
  }
  factors.push({
    label: '門檻本身',
    detail: '停航與活動門檻都是業界經驗法則，不是船公司或潛店的正式標準。當地教練與當日船班公告永遠優先。',
    weight: '中',
  })
  factors.push({
    label: '空間解析度',
    detail: '浪高取自約 25 km 的海洋格點，代表外海整體海況；島嶼東西岸在同一天可以差很多。',
    weight: '中',
  })

  const level: Confidence = leadDays > 10 ? '低' : leadDays > 5 ? '中' : '高'
  const statement =
    level === '低'
      ? '這份評估目前只能當趨勢看，不能當結論。時距太遠，模式之間對風、浪、日照都還沒有共識，任何一個數字都可能在幾天內整個翻掉。'
      : level === '中'
        ? '大方向已經可以參考，但細節仍會變。建議把它當作「要不要準備備案」的依據，而不是「要不要取消」的依據。'
        : '預報已進入可信範圍，可以據此做決定，但出發當天仍以中央氣象署警特報與船公司公告為準。'

  // ---- conclusion, assembled from what was actually found
  let conclusion: string
  if (!usable.length) {
    conclusion = '整段行程都還沒進入 16 天預報範圍，現在沒有任何數字可以判斷。'
  } else if (blocked.length) {
    conclusion = `${blocked.map((a) => dayLabel(a.day)).join('、')} 的浪高已達這條航線常見的停航門檻，這趟行程最需要準備的是「可能去不成」，而不是「玩不玩得到」。`
  } else if (poor.length >= usable.length / 2) {
    conclusion = '船應該開得了，但多數時段的浪高超過潛水門檻，主要活動需要改期或換項目。'
  } else if (fine.length === usable.length) {
    conclusion = '目前看起來條件良好，沒有需要特別擔心的因素。'
  } else {
    conclusion = '行程大致可行，但有幾個時段需要調整，把水上活動集中到條件好的那幾天。'
  }

  // ---- the causal chain
  const reasoning: string[] = []
  if (usable.length) {
    const worstWave = Math.max(0, ...usable.flatMap((a) => a.reasons.map((r) => (r.evidence.match(/浪高 ([\d.]+) m/)?.[1] ? Number(r.evidence.match(/浪高 ([\d.]+) m/)![1]) : 0))))
    if (worstWave > 0) {
      reasoning.push(`行程期間最大浪高來到 ${worstWave.toFixed(1)} m。這是整個評估的源頭——它同時決定船開不開、以及能不能下水。`)
    }
    if (blocked.length) {
      reasoning.push(`浪高超過 ${FERRY_SUSPEND_WAVE} m 時，台東富岡往綠島的航班常會停駛。這是離島行程真正的關卡：活動條件再好，船不開就沒有行程。`)
    }
    if (poor.length || blocked.length) {
      reasoning.push(`即使順利登島，浪高超過 ${DIVE_LIMIT_WAVE} m 之後船潛的上下船風險就明顯升高，浮潛與自由潛水的門檻更低。`)
    }
    const anySurf = usable.some((a) => a.stillWorks?.includes('衝浪'))
    if (anySurf) reasoning.push('唯一逆勢的是衝浪——它需要浪，所以其他活動被擋掉的日子，反而是它的條件。')
    if (cyclones.length) {
      const near = cyclones[0]
      reasoning.push(
        near.distanceKm <= 1000
          ? `熱帶系統方面，最近的 ${near.nameEn} 距此 ${Math.round(near.distanceKm).toLocaleString()} km，在影響範圍內。`
          : `熱帶系統方面，目前最近的 ${near.nameEn} 距此 ${Math.round(near.distanceKm).toLocaleString()} km，這波浪不是它造成的。`,
      )
    }
  }

  // ---- actions
  const actions: string[] = []
  if (blocked.length) {
    actions.push('把「可能上不了島」納入規劃：確認住宿與船票的取消條件，並準備台東本島的替代行程')
    actions.push('出發前一天與當天早上查船公司公告，停航決定通常是當天早上做的')
  }
  if (fine.length) actions.push(`把主要的水上活動集中在 ${fine.map((a) => dayLabel(a.day)).join('、')}`)
  const surfDay = usable.find((a) => a.stillWorks?.includes('衝浪'))
  if (surfDay && (blocked.length || poor.length)) actions.push(`浪大的日子改玩衝浪：${dayLabel(surfDay.day)} 的條件反而不錯`)
  actions.push(`${recheck}（出發前 4 天）重看一次，屆時海象模式才進入可信範圍`)
  actions.push('出發前一天再看一次，並以中央氣象署警特報為準')

  return {
    conclusion,
    reasoning,
    days: assessments.sort((a, b) => a.day - b.day || severityOf(b.status) - severityOf(a.status)),
    uncertainty: { level, statement, factors },
    actions,
    decisionPoint: recheck,
    usableDays: usable.length,
  }
}
