import { useEffect, useMemo, useRef, useState } from 'react'
import LocationPicker from './components/LocationPicker'
import OverviewPanel from './components/OverviewPanel'
import MeteogramPanel from './components/MeteogramPanel'
import ModelPanel, { modelColor } from './components/ModelPanel'
import EnsemblePanel from './components/EnsemblePanel'
import LongRangePanel from './components/LongRangePanel'
import TablePanel from './components/TablePanel'
import TripPanel, { type TripRange } from './components/TripPanel'
import { ErrorBox, Segmented, Spinner } from './components/ui'
import { DEFAULT_PLACE, type Place } from './lib/locations'
import { DEFAULT_MODELS, DETERMINISTIC, modelById } from './lib/models'
import { cssVars } from './lib/palette'
import { useForecast, useTheme, type ThemeChoice } from './lib/hooks'
import { decodeState, encodeState, type AppState } from './lib/urlState'
import { ACTIVITIES } from './lib/activities'
import './styles.css'

type Tab = 'overview' | 'trip' | 'hourly' | 'models' | 'ensemble' | 'long' | 'table'

const TABS: { value: Tab; label: string; hint: string }[] = [
  { value: 'overview', label: '總覽', hint: '目前天氣與 16 天逐日預報' },
  { value: 'trip', label: '行程評估', hint: '水上活動適宜度、船班風險與不確定性' },
  { value: 'hourly', label: '逐時', hint: '單一模式的逐時氣象圖' },
  { value: 'models', label: '多模式', hint: '各國模式疊圖與分歧分析' },
  { value: 'ensemble', label: '系集', hint: '成員分布與信心度' },
  { value: 'long', label: '長期展望', hint: '35 天次季節趨勢與距平' },
  { value: 'table', label: '資料表', hint: '原始數值與 CSV 下載' },
]

const WIND_UNITS = [
  { value: 'ms' as const, label: 'm/s' },
  { value: 'kmh' as const, label: 'km/h' },
  { value: 'kn' as const, label: '節' },
]

/**
 * Read a persisted setting, tolerating private-browsing storage failures.
 *
 * `valid` is mandatory because a stored value is untrusted input: a stale or
 * hand-edited entry (a bare `null` is enough) otherwise reaches render and takes the
 * whole page down with it. Anything that fails the check falls back silently.
 */
function persisted<T>(key: string, fallback: T, valid: (v: unknown) => boolean): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as unknown
    return valid(parsed) ? (parsed as T) : fallback
  } catch {
    return fallback
  }
}

const isPlace = (v: unknown): v is Place =>
  typeof v === 'object' && v !== null && typeof (v as Place).name === 'string' && Number.isFinite((v as Place).lat) && Number.isFinite((v as Place).lon)

const isModelList = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every((m) => DETERMINISTIC.some((d) => d.id === m))

const isWindUnit = (v: unknown) => v === 'ms' || v === 'kmh' || v === 'kn'

const DAY_MS = 86400000
const dayOf = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS

export default function App() {
  const [palette, themeChoice, setTheme] = useTheme()

  // The URL hash wins over stored settings: a shared link must reproduce what the
  // sender saw, not what this browser happened to be looking at last time.
  const initial = useMemo<AppState>(() => {
    const now = Date.now() + new Date().getTimezoneOffset() * -60000
    const base: AppState = {
      tab: 'overview',
      place: persisted('place', DEFAULT_PLACE, isPlace),
      models: persisted('models', DEFAULT_MODELS, isModelList),
      windUnit: persisted('windUnit', 'ms' as const, isWindUnit),
      tripFrom: dayOf(now) + 2 * DAY_MS,
      tripTo: dayOf(now) + 5 * DAY_MS,
      activity: ACTIVITIES[0].id,
    }
    return decodeState(window.location.hash, base)
  }, [])

  const [place, setPlace] = useState<Place>(initial.place)
  const [tab, setTab] = useState<Tab>(initial.tab as Tab)
  const [models, setModels] = useState<string[]>(initial.models)
  const [windUnit, setWindUnit] = useState<'ms' | 'kmh' | 'kn'>(initial.windUnit)
  const [trip, setTrip] = useState<TripRange>({ from: initial.tripFrom, to: initial.tripTo, activity: initial.activity })
  const [copied, setCopied] = useState(false)

  // The "now" line is per-session, not per-render, so charts don't jitter on every update.
  const [nowMs] = useState(() => {
    const d = new Date()
    // Shift real time into the same local-wall-clock space the API data lives in.
    return d.getTime() + new Date().getTimezoneOffset() * -60000
  })

  useEffect(() => {
    try {
      localStorage.setItem('place', JSON.stringify(place))
      localStorage.setItem('models', JSON.stringify(models))
      localStorage.setItem('windUnit', JSON.stringify(windUnit))
    } catch {
      /* settings just don't persist */
    }
  }, [place, models, windUnit])

  const shareHash = useMemo(
    () => encodeState({ tab, place, models, windUnit, tripFrom: trip.from, tripTo: trip.to, activity: trip.activity }),
    [tab, place, models, windUnit, trip],
  )

  useEffect(() => {
    // replaceState, not assignment: a hash change per interaction would fill the
    // back button with dozens of near-identical entries.
    window.history.replaceState(null, '', `#${shareHash}`)
  }, [shareHash])

  // Current state, for the hashchange listener to diff against without re-subscribing
  // on every keystroke (a stale closure would resurrect old settings).
  const stateRef = useRef<AppState>(initial)
  stateRef.current = { tab, place, models, windUnit, tripFrom: trip.from, tripTo: trip.to, activity: trip.activity }

  useEffect(() => {
    // Someone already on the page clicking a shared link only changes the hash — no
    // reload, so the initial parse never runs again and the page appears to ignore
    // the link. This also restores the back and forward buttons.
    // `replaceState` above never fires hashchange, so this cannot loop.
    const onHashChange = () => {
      const next = decodeState(window.location.hash, stateRef.current)
      setTab(next.tab as Tab)
      setPlace(next.place)
      setModels(next.models)
      setWindUnit(next.windUnit)
      setTrip({ from: next.tripFrom, to: next.tripTo, activity: next.activity })
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${shareHash}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('複製這個網址分享目前的分析：', url)
    }
  }

  const query = useMemo(
    () => (models.length ? { lat: place.lat, lon: place.lon, models, days: 16, windUnit } : null),
    [place, models, windUnit],
  )
  const { data: forecast, loading, error, reload } = useForecast(query)

  const toggleModel = (id: string) =>
    setModels((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((m) => m !== id) : cur) : [...cur, id]))

  const style = cssVars(palette) as React.CSSProperties

  return (
    <div className="app" style={style} data-mode={palette.mode}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">長風</span>
          <div>
            <h1>Windward</h1>
            <p>多模式・系集・35 天長期預報儀表板</p>
          </div>
        </div>
        <div className="topbar-controls">
          <LocationPicker place={place} onPick={setPlace} />
          <Segmented ariaLabel="風速單位" value={windUnit} onChange={setWindUnit} options={WIND_UNITS} />
          <button className="btn" onClick={share} title="複製連結，對方打開就是同一份分析">
            {copied ? '已複製 ✓' : '分享連結'}
          </button>
          <Segmented
            ariaLabel="外觀"
            value={themeChoice}
            onChange={(t) => setTheme(t as ThemeChoice)}
            options={[
              { value: 'system' as const, label: '自動' },
              { value: 'light' as const, label: '淺色' },
              { value: 'dark' as const, label: '深色' },
            ]}
          />
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="檢視">
        {TABS.map((t) => (
          <button key={t.value} role="tab" aria-selected={tab === t.value} title={t.hint} className={tab === t.value ? 'active' : ''} onClick={() => setTab(t.value)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab !== 'ensemble' && tab !== 'long' && tab !== 'trip' && (
        <div className="modelbar">
          <span className="modelbar-label">納入的模式</span>
          {DETERMINISTIC.map((m) => {
            const on = models.includes(m.id)
            return (
              <button
                key={m.id}
                className={`chip-toggle${on ? ' on' : ''}`}
                title={`${m.centre}・${m.maxDays} 天・${m.resolution}${m.note ? '・' + m.note : ''}`}
                onClick={() => toggleModel(m.id)}
                aria-pressed={on}
              >
                <span className="legend-swatch" style={{ background: on ? modelColor(m.id, palette) : 'transparent', borderColor: modelColor(m.id, palette) }} />
                {m.name}
                <em>{m.maxDays}d</em>
              </button>
            )
          })}
        </div>
      )}

      <main className="content">
        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading && !forecast && <Spinner label="向 Open-Meteo 取得多模式預報…" />}

        {forecast && tab === 'overview' && <OverviewPanel forecast={forecast} palette={palette} nowMs={nowMs} />}
        {forecast && tab === 'trip' && (
          <TripPanel place={place} forecast={forecast} palette={palette} nowMs={nowMs} windUnit={windUnit} range={trip} onRangeChange={setTrip} />
        )}
        {forecast && tab === 'hourly' && <MeteogramPanel forecast={forecast} palette={palette} nowMs={nowMs} />}
        {forecast && tab === 'models' && <ModelPanel forecast={forecast} palette={palette} nowMs={nowMs} />}
        {tab === 'ensemble' && <EnsemblePanel place={place} palette={palette} nowMs={nowMs} windUnit={windUnit} />}
        {tab === 'long' && <LongRangePanel place={place} palette={palette} nowMs={nowMs} windUnit={windUnit} />}
        {forecast && tab === 'table' && <TablePanel forecast={forecast} palette={palette} placeName={place.name} />}
      </main>

      <footer className="foot">
        <p>
          預報資料 <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>（CC BY 4.0）・
          模式來源 ECMWF、NOAA、DWD、JMA、CMC、Met Office・氣候基準 ERA5 再分析
        </p>
        <p className="muted">
          {forecast ? (
            <>
              目前載入 {forecast.models.map((m) => modelById(m)?.name ?? m).join('、')}・格點高度 {Math.round(forecast.elevation)} m・時區 {forecast.timezone}
            </>
          ) : (
            '—'
          )}
        </p>
      </footer>
    </div>
  )
}
