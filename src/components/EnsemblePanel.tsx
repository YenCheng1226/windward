import { useMemo, useState } from 'react'
import { ENSEMBLES, ensembleById } from '../lib/models'
import { alpha, type Palette } from '../lib/palette'
import { useEnsemble } from '../lib/hooks'
import type { Place } from '../lib/locations'
import { trimNullTail } from '../lib/openmeteo'
import { VAR_LABELS, confidence, dateTimeLabel, exceedance, spreadOf } from '../lib/weather'
import TimeChart, { type ChartBand, type ChartSeries } from './TimeChart'
import { Card, ErrorBox, Legend, Segmented, Spinner, StatTile } from './ui'

const ENS_VARS = ['temperature_2m', 'precipitation', 'wind_speed_10m', 'wind_gusts_10m', 'pressure_msl', 'cloud_cover', 'relative_humidity_2m']

/** Exceedance thresholds that mean something in a Taiwanese forecast. */
const THRESHOLDS: Record<string, { value: number; label: string }[]> = {
  precipitation: [
    { value: 0.1, label: '有降水（≥0.1 mm/h）' },
    { value: 1, label: '明顯降雨（≥1 mm/h）' },
    { value: 5, label: '強降雨（≥5 mm/h）' },
  ],
  temperature_2m: [
    { value: 30, label: '≥30 °C' },
    { value: 35, label: '≥35 °C 高溫' },
  ],
  wind_speed_10m: [
    { value: 8, label: '≥8 m/s（5 級）' },
    { value: 13.9, label: '≥13.9 m/s（7 級）' },
  ],
  wind_gusts_10m: [
    { value: 17.2, label: '陣風 ≥17.2 m/s（8 級）' },
    { value: 24.5, label: '陣風 ≥24.5 m/s（10 級）' },
  ],
}

export default function EnsemblePanel({ place, palette, nowMs, windUnit }: { place: Place; palette: Palette; nowMs: number; windUnit: 'ms' | 'kmh' | 'kn' }) {
  const [model, setModel] = useState('ecmwf_ifs025')
  const [variable, setVariable] = useState('temperature_2m')
  const [spaghetti, setSpaghetti] = useState(false)

  const def = ensembleById(model)!
  const days = Math.min(Math.ceil(def.maxDays), 16)

  const { data, loading, error, reload } = useEnsemble({ lat: place.lat, lon: place.lon, model, variable, days, windUnit })

  const view = useMemo(() => {
    if (!data) return null
    const n = trimNullTail(data.time, data.members)
    const time = data.time.slice(0, n)
    const members = data.members.map((m) => m.slice(0, n))
    const s = spreadOf(members, n)
    return { time, members, spread: s, n }
  }, [data])

  const series: ChartSeries[] = useMemo(() => {
    if (!view) return []
    const c = palette.series[0]
    const out: ChartSeries[] = [
      { label: 'p90', values: view.spread.p90, color: c, boundary: true, hideInTooltip: true },
      { label: 'p10', values: view.spread.p10, color: c, boundary: true, hideInTooltip: true },
      { label: 'p75', values: view.spread.p75, color: c, boundary: true, hideInTooltip: true },
      { label: 'p25', values: view.spread.p25, color: c, boundary: true, hideInTooltip: true },
    ]
    if (spaghetti) {
      // Members after the control run; thin, low-contrast, and kept out of the tooltip.
      view.members.slice(1).forEach((m, i) => {
        out.push({ label: `成員 ${i + 1}`, values: m, color: alpha(palette.textMuted, 0.38), width: 1, hideInTooltip: true })
      })
    }
    out.push(
      { label: '控制場', values: view.members[0], color: palette.series[1], width: 2, dash: [5, 4], unit: data?.unit },
      { label: '系集中位數', values: view.spread.median, color: c, width: 2.5, unit: data?.unit },
    )
    return out
  }, [view, palette, spaghetti, data?.unit])

  const bands: ChartBand[] = useMemo(
    () => [
      { upper: 0, lower: 1, fill: alpha(palette.series[0], 0.14) },
      { upper: 2, lower: 3, fill: alpha(palette.series[0], 0.22) },
    ],
    [palette],
  )

  const spreadSeries: ChartSeries[] = useMemo(() => {
    if (!view) return []
    return [{ label: '成員離散度（p90−p10）', values: view.spread.iqr90, color: palette.series[7], width: 2, fill: alpha(palette.series[7], 0.16), unit: data?.unit }]
  }, [view, palette, data?.unit])

  const probSeries: ChartSeries[] = useMemo(() => {
    if (!view) return []
    const list = THRESHOLDS[variable]
    if (!list) return []
    return list.map((t, i) => ({
      label: t.label,
      values: exceedance(view.members, view.n, t.value),
      color: palette.series[[0, 1, 7][i] ?? i],
      width: 2,
      unit: '%',
    }))
  }, [view, variable, palette])

  const stats = useMemo(() => {
    if (!view) return null
    const idxAt = (dayOffset: number) => {
      const target = nowMs + dayOffset * 86400000
      let best = -1
      for (let i = 0; i < view.time.length; i++) if (view.time[i] <= target) best = i
      return best
    }
    const i7 = idxAt(7)
    const iNow = Math.max(idxAt(0), 0)
    const nowConf = confidence(view.spread.iqr90[iNow] ?? null, variable)
    const conf7 = i7 >= 0 ? confidence(view.spread.iqr90[i7] ?? null, variable) : null
    // The horizon where the fan first exceeds the "low confidence" band for this variable.
    let usefulTo: number | null = null
    for (let i = 0; i < view.n; i++) {
      if (confidence(view.spread.iqr90[i] ?? null, variable).level === '低') {
        usefulTo = view.time[i]
        break
      }
    }
    return { i7, iNow, nowConf, conf7, usefulTo }
  }, [view, variable, nowMs])

  return (
    <>
      <Card
        title="系集預報"
        subtitle="同一個模式跑數十次、每次初始條件微調，得到一整叢可能的未來。叢越窄代表越有把握——這是判斷長期預報能不能相信的唯一方法。"
        actions={
          <Segmented
            ariaLabel="選擇系集"
            value={model}
            onChange={(m) => setModel(m)}
            options={ENSEMBLES.map((e) => ({ value: e.id, label: e.name, title: `${e.centre}・${e.members} 成員・${e.maxDays} 天` }))}
          />
        }
      >
        <div className="toolbar">
          <Segmented
            ariaLabel="選擇變數"
            value={variable}
            onChange={setVariable}
            options={ENS_VARS.map((v) => ({ value: v, label: VAR_LABELS[v] ?? v }))}
          />
          <label className="switch">
            <input type="checkbox" checked={spaghetti} onChange={(e) => setSpaghetti(e.target.checked)} />
            顯示全部成員（義大利麵圖）
          </label>
        </div>
        {stats && view && (
          <div className="stat-grid stat-grid-4">
            <StatTile label="系集成員" value={String(view.members.length)} unit=" 組" note={`${def.centre}・${def.resolution}`} />
            <StatTile
              label="目前信心度"
              value={stats.nowConf.level}
              note={`離散度 ${(view.spread.iqr90[stats.iNow] ?? 0).toFixed(1)} ${data?.unit ?? ''}`}
              tone={stats.nowConf.tone === 'muted' ? undefined : stats.nowConf.tone}
            />
            <StatTile
              label="+7 天信心度"
              value={stats.conf7?.level ?? '—'}
              note={stats.i7 >= 0 ? `中位數 ${(view.spread.median[stats.i7] ?? 0).toFixed(1)} ${data?.unit ?? ''}` : '超出此系集時距'}
              tone={stats.conf7 && stats.conf7.tone !== 'muted' ? stats.conf7.tone : undefined}
            />
            <StatTile
              label="可信範圍到"
              value={stats.usefulTo != null ? `+${((stats.usefulTo - nowMs) / 86400000).toFixed(1)}` : `${def.maxDays}+`}
              unit=" 天"
              note={stats.usefulTo != null ? `${dateTimeLabel(stats.usefulTo)} 之後離散度過大` : '全期間離散度都在可用範圍'}
              tone={stats.usefulTo != null && stats.usefulTo - nowMs < 5 * 86400000 ? 'warning' : 'good'}
            />
          </div>
        )}
      </Card>

      {loading && !view && <Spinner label={`載入 ${def.name} 的 ${def.members} 組成員…`} />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {view && (
        <>
          <Card title={`${VAR_LABELS[variable]} — 系集分布`} subtitle={`${def.name}・單位 ${data?.unit ?? ''}・拖曳可放大`}>
            <Legend
              items={[
                { label: '系集中位數', color: palette.series[0] },
                { label: '控制場（未擾動）', color: palette.series[1], dash: true },
                { label: '25–75 百分位（半數成員）', color: alpha(palette.series[0], 0.45), swatch: 'band' },
                { label: '10–90 百分位（八成成員）', color: alpha(palette.series[0], 0.24), swatch: 'band' },
                ...(spaghetti ? [{ label: '個別成員', color: alpha(palette.textMuted, 0.5) }] : []),
              ]}
            />
            <TimeChart time={view.time} series={series} bands={bands} palette={palette} unit={data?.unit ?? ''} height={360} markerAt={nowMs} />
          </Card>

          {probSeries.length > 0 && (
            <Card title="門檻超越機率" subtitle="有多少比例的成員超過這個門檻・單位 %">
              <Legend items={probSeries.map((s) => ({ label: s.label, color: s.color }))} />
              <TimeChart time={view.time} series={probSeries} palette={palette} unit="%" height={220} yMin={0} yMax={100} markerAt={nowMs} />
            </Card>
          )}

          <Card title="離散度隨時間變化" subtitle={`p90 − p10・單位 ${data?.unit ?? ''}・曲線抬升的位置就是預報開始失去意義的地方`}>
            <Legend items={[{ label: '成員離散度（p90−p10）', color: palette.series[7] }]} />
            <TimeChart time={view.time} series={spreadSeries} palette={palette} unit={data?.unit ?? ''} height={200} yMin={0} markerAt={nowMs} />
          </Card>
        </>
      )}
    </>
  )
}
