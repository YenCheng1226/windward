import { useEffect, useMemo, useState } from 'react'
import LocationPicker from './components/LocationPicker'
import OverviewPanel from './components/OverviewPanel'
import MeteogramPanel from './components/MeteogramPanel'
import ModelPanel, { modelColor } from './components/ModelPanel'
import EnsemblePanel from './components/EnsemblePanel'
import LongRangePanel from './components/LongRangePanel'
import TablePanel from './components/TablePanel'
import { ErrorBox, Segmented, Spinner } from './components/ui'
import { DEFAULT_PLACE, type Place } from './lib/locations'
import { DEFAULT_MODELS, DETERMINISTIC, modelById } from './lib/models'
import { cssVars } from './lib/palette'
import { useForecast, useTheme, type ThemeChoice } from './lib/hooks'
import './styles.css'

type Tab = 'overview' | 'hourly' | 'models' | 'ensemble' | 'long' | 'table'

const TABS: { value: Tab; label: string; hint: string }[] = [
  { value: 'overview', label: '總覽', hint: '目前天氣與 16 天逐日預報' },
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

/** Read a persisted setting, tolerating private-browsing storage failures. */
function persisted<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export default function App() {
  const [palette, themeChoice, setTheme] = useTheme()
  const [place, setPlace] = useState<Place>(() => persisted('place', DEFAULT_PLACE))
  const [tab, setTab] = useState<Tab>('overview')
  const [models, setModels] = useState<string[]>(() => persisted('models', DEFAULT_MODELS))
  const [windUnit, setWindUnit] = useState<'ms' | 'kmh' | 'kn'>(() => persisted('windUnit', 'ms' as const))

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

      {tab !== 'ensemble' && tab !== 'long' && (
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
