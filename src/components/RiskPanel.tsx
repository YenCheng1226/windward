import { useMemo, useRef, useState } from 'react'
import type { Place } from '../lib/locations'
import type { Forecast } from '../lib/openmeteo'
import type { Palette } from '../lib/palette'
import { STATUS_LABEL, STATUS_TONE, type Confidence, type DayAssessment, assessTrip } from '../lib/risk'
import { useTripData, type TripWindow } from '../lib/useTrip'
import { buildHtmlReport, downloadHtml, exportPng } from '../lib/exportReport'
import { dayLabel, weekdayLabel } from '../lib/weather'
import { RiskStrip, SituationPlot, statusColor } from './RiskDiagrams'
import { Card, ErrorBox, Segmented, Spinner } from './ui'
import { TOLERANCE_LABEL, type Tolerance } from '../lib/activities'
import LocationPicker from './LocationPicker'

const CONF_TONE: Record<Confidence, 'good' | 'warning' | 'critical'> = { 高: 'good', 中: 'warning', 低: 'critical' }

export default function RiskPanel({
  place,
  forecast,
  palette,
  nowMs,
  windUnit,
  range,
  onRangeChange,
  onPlaceChange,
  onOpenDetail,
}: {
  place: Place
  forecast: Forecast
  palette: Palette
  nowMs: number
  windUnit: 'ms' | 'kmh' | 'kn'
  range: TripWindow
  onRangeChange: (r: TripWindow) => void
  onPlaceChange: (p: Place) => void
  onOpenDetail: () => void
}) {
  const toInput = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const fromInput = (v: string) => Date.parse(v + 'T00:00:00Z')
  const DAY = 86400000
  const dayOfMs = (ms: number) => Math.floor(ms / DAY) * DAY

  /** Move the whole window, keeping its length — the common case is "a day later". */
  const shift = (deltaDays: number) =>
    onRangeChange({ ...range, from: range.from + deltaDays * DAY, to: range.to + deltaDays * DAY })

  const t = useTripData(place, forecast, windUnit, range, nowMs)
  const stripRef = useRef<SVGSVGElement>(null)
  const situationRef = useRef<SVGSVGElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const entersLabel = useMemo(
    () => (day: number) => {
      const d = t.entersRange(day)
      return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
    },
    [t],
  )

  const a = useMemo(
    () => assessTrip(t.summary, t.cyclones.data ?? [], t.outOfRange, entersLabel, t.leadDays, t.recheck, t.waveSpreadMax, !t.beyondMarine),
    [t.summary, t.cyclones.data, t.outOfRange, entersLabel, t.leadDays, t.recheck, t.waveSpreadMax, t.beyondMarine],
  )

  const rangeLabel = `${dayLabel(range.from)}–${dayLabel(range.to)}`
  const fileStem = `${place.name}_${dayLabel(range.from).replace('/', '')}-${dayLabel(range.to).replace('/', '')}`
  const generated = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }, [])

  const svgNodes = () => [stripRef.current, situationRef.current].filter((n): n is SVGSVGElement => n != null)

  const savePng = async () => {
    setBusy('png')
    setNote(null)
    try {
      await exportPng(svgNodes(), `${fileStem}_行程狀態圖.png`, palette.surface1)
      setNote('示意圖已下載')
    } catch (e) {
      setNote(`匯出失敗：${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const saveHtml = () => {
    setBusy('html')
    setNote(null)
    try {
      const blob = buildHtmlReport({
        title: `${place.name} ${rangeLabel} 行程評估`,
        place: place.name,
        range: rangeLabel,
        generated,
        conclusion: a.conclusion,
        reasoning: a.reasoning,
        uncertainty: a.uncertainty,
        days: a.days.map((d) => ({
          date: dayLabel(d.day),
          weekday: weekdayLabel(d.day),
          status: d.outOfRange ? '無預報' : STATUS_LABEL[d.status],
          tone: d.outOfRange ? 'muted' : STATUS_TONE[d.status],
          verdict: d.outOfRange ? (d.entersRange ? `${d.entersRange} 起會有第一版預報` : '') : d.verdict,
          reasons: d.reasons,
          wouldChange: d.wouldChange,
          stillWorks: d.stillWorks,
        })),
        actions: a.actions,
        svgs: svgNodes(),
        sourceNote: `預報資料 Open-Meteo（CC BY 4.0）・大氣模式 ${forecast.models.length} 家・波浪 NCEP GFS-Wave 與 ECMWF WAM・熱帶系統 日本氣象廳 RSMC 東京與 JTWC・座標 ${place.lat.toFixed(3)}°N ${place.lon.toFixed(3)}°E・由長風 Windward 產生`,
        dark: palette.mode === 'dark',
      })
      downloadHtml(blob, `${fileStem}_行程評估.html`)
      setNote('評估報告已下載，可直接用瀏覽器開啟或轉成 PDF')
    } catch (e) {
      setNote(`匯出失敗：${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const loading = (t.marine.loading && !t.marine.data) || (t.cyclones.loading && !t.cyclones.data)

  return (
    <>
      <Card
        title={`${place.name} ${rangeLabel} 行程評估`}
        subtitle={`資料時間 ${generated}・距出發 ${t.leadDays} 天・${forecast.models.length} 家大氣模式 + 系集 + 兩家波浪模式 + 熱帶系統・門檻容許度「${TOLERANCE_LABEL[range.tolerance].name}」（${TOLERANCE_LABEL[range.tolerance].blurb}）`}
        actions={
          <div className="toolbar">
            <button className="btn" onClick={savePng} disabled={busy != null}>
              {busy === 'png' ? '產生中…' : '下載狀態圖 PNG'}
            </button>
            <button className="btn primary" onClick={saveHtml} disabled={busy != null}>
              {busy === 'html' ? '產生中…' : '下載評估報告'}
            </button>
          </div>
        }
      >
        <div className="trip-controls">
          <label className="field">
            <span>地點</span>
            <LocationPicker place={place} onPick={onPlaceChange} />
          </label>
          <label className="field">
            <span>出發</span>
            <input
              type="date"
              value={toInput(range.from)}
              max={toInput(range.to)}
              onChange={(e) => {
                const v = fromInput(e.target.value)
                if (Number.isFinite(v)) onRangeChange({ ...range, from: v, to: Math.max(v, range.to) })
              }}
            />
          </label>
          <label className="field">
            <span>結束</span>
            <input
              type="date"
              value={toInput(range.to)}
              min={toInput(range.from)}
              onChange={(e) => {
                const v = fromInput(e.target.value)
                // Ten days is the practical ceiling: past that the window outruns every model.
                if (Number.isFinite(v)) onRangeChange({ ...range, to: Math.min(Math.max(v, range.from), range.from + 9 * DAY) })
              }}
            />
          </label>
          <span className="trip-len">{Math.round((dayOfMs(range.to) - dayOfMs(range.from)) / DAY) + 1} 天</span>
          <label className="field">
            <span>容許度</span>
            <Segmented
              ariaLabel="活動門檻的容許度"
              value={range.tolerance}
              onChange={(v) => onRangeChange({ ...range, tolerance: v as Tolerance })}
              options={(['cautious', 'standard', 'bold'] as Tolerance[]).map((t) => ({
                value: t,
                label: TOLERANCE_LABEL[t].name,
                title: TOLERANCE_LABEL[t].blurb,
              }))}
            />
          </label>
          <span className="trip-nudge">
            <button className="btn tiny" onClick={() => shift(-1)} title="整段行程提前一天">
              ← 前一天
            </button>
            <button className="btn tiny" onClick={() => shift(1)} title="整段行程延後一天">
              後一天 →
            </button>
          </span>
        </div>

        <div className="conclusion">
          <span className="conclusion-tag">結論</span>
          <p>{a.conclusion}</p>
        </div>

        {a.reasoning.length > 0 && (
          <div className="reasoning">
            <h4>為什麼</h4>
            <ol>
              {a.reasoning.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </div>
        )}

        <div className={`uncertainty tone-${CONF_TONE[a.uncertainty.level]}`}>
          <h4>
            這份評估有多可信　<span className="uncertainty-level">{a.uncertainty.level}</span>
          </h4>
          <p>{a.uncertainty.statement}</p>
          <ul>
            {a.uncertainty.factors.map((f) => (
              <li key={f.label}>
                <strong>{f.label}</strong>
                <span>{f.detail}</span>
              </li>
            ))}
          </ul>
        </div>

        {note && <p className="hint">{note}</p>}
      </Card>

      {loading && <Spinner label="讀取海象與熱帶系統資料…" />}
      {t.marine.error && <ErrorBox message={`海象資料：${t.marine.error}`} onRetry={t.marine.reload} />}

      <Card title="逐日狀態" subtitle="每天的結論與仍然可行的活動。沒有分數——分數排得出順序，但說不出理由。">
        <RiskStrip days={a.days} palette={palette} ref={stripRef} />
      </Card>

      <Card title="逐日理由" subtitle="每個判斷的依據、它被拿來比較的門檻，以及為什麼只有這樣的把握。">
        <div className="day-reasons">
          {a.days.map((d) => (
            <DayCard key={d.day} day={d} palette={palette} />
          ))}
        </div>
      </Card>

      <Card title="熱帶系統相對位置" subtitle="距離為對數尺度、方位為真方位，虛線是預報路徑。這是示意圖不是地圖，回答的是「有沒有東西靠近、有沒有朝這來」。">
        {t.cyclones.data && t.cyclones.data.length === 0 ? (
          <p className="hint">目前西北太平洋沒有活躍的熱帶氣旋。</p>
        ) : (
          <SituationPlot place={place.name} cyclones={t.cyclones.data ?? []} palette={palette} ref={situationRef} />
        )}
      </Card>

      <Card title="建議行動">
        <ol className="actions">
          {a.actions.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
        <div className="toolbar" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onOpenDetail}>
            看逐時段詳細評估 →
          </button>
        </div>
      </Card>
    </>
  )
}

function DayCard({ day, palette }: { day: DayAssessment; palette: Palette }) {
  const color = day.outOfRange ? palette.textMuted : statusColor(day.status, palette)
  return (
    <div className="day-card">
      <div className="day-card-head">
        <strong>{dayLabel(day.day)}</strong>
        <span className="muted">週{weekdayLabel(day.day)}</span>
        <span className="day-status" style={{ color }}>
          {day.outOfRange ? '無預報' : STATUS_LABEL[day.status]}
        </span>
      </div>
      <p className="day-verdict">{day.outOfRange ? (day.entersRange ? `${day.entersRange} 起會有第一版預報，在那之前沒有任何數字可以判斷。` : '') : day.verdict}</p>

      {day.reasons.length > 0 && (
        <ul className="reason-list">
          {day.reasons.map((r) => (
            <li key={r.claim}>
              <div className="reason-claim">
                {r.claim}
                <span className={`reason-conf tone-${CONF_TONE[r.confidence]}`}>把握 {r.confidence}</span>
              </div>
              <p className="reason-evidence">{r.evidence}</p>
              <p className="reason-basis">為什麼只有這樣的把握：{r.basis}</p>
            </li>
          ))}
        </ul>
      )}

      {!day.outOfRange && (
        <div className="day-foot">
          {day.stillWorks && <p className="day-works">仍然可行：{day.stillWorks}</p>}
          <p className="day-change">會翻盤的條件：{day.wouldChange}</p>
        </div>
      )}
    </div>
  )
}
