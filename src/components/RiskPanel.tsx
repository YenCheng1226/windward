import { useMemo, useRef, useState } from 'react'
import type { Place } from '../lib/locations'
import type { Forecast } from '../lib/openmeteo'
import type { Palette } from '../lib/palette'
import { assessTrip, RISK_TONE, type DayRisk } from '../lib/risk'
import { useTripData, type TripWindow } from '../lib/useTrip'
import { buildHtmlReport, downloadHtml, exportPng } from '../lib/exportReport'
import { dayLabel, weekdayLabel } from '../lib/weather'
import { RiskTimeline, SituationPlot, riskColor } from './RiskDiagrams'
import { Card, ErrorBox, Spinner } from './ui'

const CAVEATS = [
  '活動門檻是潛店與水上活動業者的通用經驗法則，未針對特定點位校正；當地教練的判斷永遠優先。',
  '船班停航門檻是這條航線常見的停航海況，不是船公司或港務單位的標準，實際以當日公告為準。',
  '浪高沒有公開系集，不確定性只能用兩家波浪模式的差異估計，會低估真實範圍。',
  '熱帶系統資料來自日本氣象廳與 JTWC；台灣實際發布的警特報以中央氣象署為準。',
  '這是一份快照，不會自動更新。十天以外的預報一定會變，出發前務必重看。',
]

export default function RiskPanel({
  place,
  forecast,
  palette,
  nowMs,
  windUnit,
  range,
  onOpenDetail,
}: {
  place: Place
  forecast: Forecast
  palette: Palette
  nowMs: number
  windUnit: 'ms' | 'kmh' | 'kn'
  range: TripWindow
  onOpenDetail: () => void
}) {
  const t = useTripData(place, forecast, windUnit, range, nowMs)
  const timelineRef = useRef<SVGSVGElement>(null)
  const situationRef = useRef<SVGSVGElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const risk = useMemo(
    () => assessTrip(t.summary, t.cyclones.data ?? [], t.outOfRange, t.leadDays, t.recheck),
    [t.summary, t.cyclones.data, t.outOfRange, t.leadDays, t.recheck],
  )

  const rangeLabel = `${dayLabel(range.from)}–${dayLabel(range.to)}`
  /** Slashes and dashes are legal in filenames on some systems and not others. */
  const fileStem = `${place.name}_${dayLabel(range.from).replace('/', '')}-${dayLabel(range.to).replace('/', '')}`
  const generated = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }, [])

  const svgNodes = () => [timelineRef.current, situationRef.current].filter((n): n is SVGSVGElement => n != null)

  const savePng = async () => {
    setBusy('png')
    setNote(null)
    try {
      await exportPng(svgNodes(), `${fileStem}_風險示意圖.png`, palette.surface1)
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
        title: `${place.name} ${rangeLabel} 行程風險報告`,
        place: place.name,
        range: rangeLabel,
        generated,
        level: risk.level,
        score: risk.score,
        headline: risk.headline,
        summary: risk.summary,
        actions: risk.actions,
        rows: risk.days.map((d) => ({
          date: dayLabel(d.day),
          weekday: weekdayLabel(d.day),
          level: d.outOfRange ? '無預報' : d.level,
          score: d.outOfRange ? null : d.score,
          driver: d.outOfRange ? '尚未進入預報範圍' : (d.dominant?.label ?? '—'),
          detail: d.outOfRange ? `${t.entersRange(d.day).getUTCMonth() + 1}/${t.entersRange(d.day).getUTCDate()} 進入預報` : (d.dominant?.detail ?? ''),
          best: d.bestActivity && d.bestActivity.score > 0 ? `${d.bestActivity.name} ${d.bestActivity.score}` : '無可行活動',
        })),
        svgs: svgNodes(),
        caveats: CAVEATS,
        sourceNote: `預報資料 Open-Meteo（CC BY 4.0）・模式 ${forecast.models.length} 家・熱帶系統 日本氣象廳 RSMC 東京與 JTWC・座標 ${place.lat.toFixed(3)}°N ${place.lon.toFixed(3)}°E・由長風 Windward 產生`,
        dark: palette.mode === 'dark',
      })
      downloadHtml(blob, `${fileStem}_風險報告.html`)
      setNote('風險報告已下載，可直接用瀏覽器開啟或轉成 PDF')
    } catch (e) {
      setNote(`匯出失敗：${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const loading = (t.marine.loading && !t.marine.data) || (t.cyclones.loading && !t.cyclones.data)
  const tone = RISK_TONE[risk.level]

  return (
    <>
      <Card
        title={`${place.name} ${rangeLabel} 行程風險`}
        subtitle={`資料時間 ${generated}・距出發 ${t.leadDays} 天・${forecast.models.length} 家模式 + 系集 + 海象 + 熱帶系統`}
        actions={
          <div className="toolbar">
            <button className="btn" onClick={savePng} disabled={busy != null}>
              {busy === 'png' ? '產生中…' : '下載示意圖 PNG'}
            </button>
            <button className="btn primary" onClick={saveHtml} disabled={busy != null}>
              {busy === 'html' ? '產生中…' : '下載風險報告'}
            </button>
          </div>
        }
      >
        <div className={`hero-risk tone-${tone}`}>
          <div className="hero-score">
            <span className="hero-level" style={{ color: riskColor(risk.level, palette) }}>{risk.level}</span>
            <span className="hero-num">
              {risk.score}
              <em>/100</em>
            </span>
            <span className="hero-cap">整體風險</span>
          </div>
          <div className="hero-text">
            <h3>{risk.headline}</h3>
            <p>{risk.summary}</p>
          </div>
        </div>
        {note && <p className="hint">{note}</p>}
      </Card>

      {loading && <Spinner label="讀取海象與熱帶系統資料…" />}
      {t.marine.error && <ErrorBox message={`海象資料：${t.marine.error}`} onRetry={t.marine.reload} />}

      <Card title="逐日風險" subtitle="柱高是風險分數，柱下是這天最主要的限制因素。分數低的日子就是該把水上活動排進去的日子。">
        <RiskTimeline days={risk.days} palette={palette} ref={timelineRef} />
      </Card>

      <div className="grid-2">
        <Card title="熱帶系統相對位置" subtitle="距離為對數尺度、方位為真方位，虛線是預報路徑。這是示意圖不是地圖，回答的是「有沒有東西靠近、有沒有朝這來」。">
          {t.cyclones.data && t.cyclones.data.length === 0 ? (
            <p className="hint">目前西北太平洋沒有活躍的熱帶氣旋。</p>
          ) : (
            <SituationPlot place={place.name} cyclones={t.cyclones.data ?? []} palette={palette} ref={situationRef} />
          )}
        </Card>

        <Card title="風險因素分解" subtitle="每天拆成船班、海況、風勢、天氣、熱帶系統五項，取最高的那項作為主要因素。">
          <div className="driver-list">
            {risk.days.filter((d) => !d.outOfRange).map((d) => (
              <DayDrivers key={d.day} day={d} palette={palette} />
            ))}
            {risk.days.some((d) => d.outOfRange) && (
              <p className="hint">
                {risk.days.filter((d) => d.outOfRange).map((d) => dayLabel(d.day)).join('、')} 超出 16 天預報範圍，尚無資料。
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card title="建議行動">
        <ol className="actions">
          {risk.actions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ol>
        <div className="toolbar" style={{ marginTop: 14 }}>
          <button className="btn" onClick={onOpenDetail}>
            看逐時段詳細評估 →
          </button>
        </div>
      </Card>

      <Card title="這份報告的限制">
        <ul className="caveats">
          {CAVEATS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Card>
    </>
  )
}

function DayDrivers({ day, palette }: { day: DayRisk; palette: Palette }) {
  return (
    <div className="driver-day">
      <div className="driver-head">
        <strong>{dayLabel(day.day)}</strong>
        <span className="muted">週{weekdayLabel(day.day)}</span>
        <span className="driver-level" style={{ color: riskColor(day.level, palette) }}>
          {day.level} {day.score}
        </span>
      </div>
      <p className="driver-headline">{day.headline}</p>
      <ul className="driver-bars">
        {day.drivers.map((dr) => (
          <li key={dr.key} title={dr.detail}>
            <span className="dl">{dr.label}</span>
            <span className="db">
              <i
                style={{
                  width: `${Math.max(2, dr.severity)}%`,
                  background: dr.severity >= 60 ? palette.critical : dr.severity >= 30 ? palette.warning : palette.good,
                }}
              />
            </span>
            <span className="dv">{Math.round(dr.severity)}</span>
          </li>
        ))}
      </ul>
      {day.dominant && <p className="driver-detail">{day.dominant.detail}</p>}
    </div>
  )
}
