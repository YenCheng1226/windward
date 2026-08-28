/**
 * The whole dashboard state lives in the URL hash, so a link *is* the analysis:
 * send someone `…#tab=trip&name=綠島&from=2026-09-09…` and they open exactly what you
 * were looking at. The hash is used rather than the query string because this is a
 * static site — no server ever needs to see it, and it survives any host.
 *
 * Everything here is untrusted input: a hand-edited or truncated link must degrade to
 * defaults, never throw on the way to the first render.
 */
import { DETERMINISTIC } from './models'
import { ACTIVITIES } from './activities'
import type { Place } from './locations'

export interface AppState {
  tab: string
  place: Place
  models: string[]
  windUnit: 'ms' | 'kmh' | 'kn'
  tripFrom: number
  tripTo: number
  activity: string
}

const DAY_MS = 86400000
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const fromDate = (s: string) => Date.parse(s + 'T00:00:00Z')

export function encodeState(s: AppState): string {
  const p = new URLSearchParams({
    tab: s.tab,
    name: s.place.name,
    lat: s.place.lat.toFixed(4),
    lon: s.place.lon.toFixed(4),
    models: s.models.join(','),
    u: s.windUnit,
  })
  // Both the risk page and the detail page are trip-scoped and let the dates be
  // edited, so a shared link from either must carry the window it was showing.
  if (s.tab === 'risk' || s.tab === 'trip') {
    p.set('from', toDate(s.tripFrom))
    p.set('to', toDate(s.tripTo))
    p.set('act', s.activity)
  }
  return p.toString()
}

/** Merge whatever the hash carries onto `base`; anything invalid is ignored. */
export function decodeState(hash: string, base: AppState): AppState {
  const out = { ...base }
  try {
    const p = new URLSearchParams(hash.replace(/^#/, ''))
    if (!p.toString()) return out

    const tab = p.get('tab')
    if (tab) out.tab = tab

    const lat = Number(p.get('lat'))
    const lon = Number(p.get('lon'))
    const name = p.get('name')
    if (name && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      out.place = { name, lat, lon, group: '景點 / 海域' }
    }

    const models = p.get('models')?.split(',').filter((m) => DETERMINISTIC.some((d) => d.id === m))
    if (models?.length) out.models = models

    const u = p.get('u')
    if (u === 'ms' || u === 'kmh' || u === 'kn') out.windUnit = u

    const from = p.get('from') ? fromDate(p.get('from')!) : NaN
    const to = p.get('to') ? fromDate(p.get('to')!) : NaN
    if (Number.isFinite(from)) out.tripFrom = from
    if (Number.isFinite(to)) out.tripTo = to
    // A reversed or absurd range would render an empty table; clamp instead.
    if (out.tripTo < out.tripFrom) out.tripTo = out.tripFrom
    if (out.tripTo - out.tripFrom > 9 * DAY_MS) out.tripTo = out.tripFrom + 9 * DAY_MS

    const act = p.get('act')
    if (act && ACTIVITIES.some((a) => a.id === act)) out.activity = act
  } catch {
    return base
  }
  return out
}
