import { useMemo, useState } from 'react'
import type { Forecast } from '../lib/openmeteo'
import { DETERMINISTIC, modelById } from '../lib/models'
import { alpha, type Palette } from '../lib/palette'
import { VAR_LABELS, dateTimeLabel, modelSpread } from '../lib/weather'
import TimeChart, { type ChartSeries } from './TimeChart'
import { Card, Legend, Segmented, StatTile } from './ui'

const COMPARE_VARS = ['temperature_2m', 'precipitation', 'wind_speed_10m', 'pressure_msl', 'cloud_cover', 'relative_humidity_2m']

/**
 * Colour follows the model, never its position in the current selection — turning a
 * model off must not repaint the others. The slot is the model's index in the
 * catalogue, so ECMWF IFS is the same blue in every chart and every session.
 */
export const modelColor = (id: string, palette: Palette) => palette.series[DETERMINISTIC.findIndex((m) => m.id === id) % palette.series.length]

/** Spread threshold above which the models have meaningfully parted company. */
const DIVERGENCE: Record<string, number> = {
  temperature_2m: 3,
  precipitation: 3,
  wind_speed_10m: 3,
  pressure_msl: 5,
  cloud_cover: 40,
  relative_humidity_2m: 25,
}

export default function ModelPanel({ forecast, palette, nowMs }: { forecast: Forecast; palette: Palette; nowMs: number }) {
  const [variable, setVariable] = useState('temperature_2m')
  const byModel = forecast.hourly.vars[variable] ?? {}
  const unit = forecast.hourly.units[variable] ?? ''

  const activeModels = forecast.models.filter((m) => byModel[m]?.some((v) => v != null))

  const series: ChartSeries[] = useMemo(
    () =>
      activeModels.map((m) => ({
        label: modelById(m)?.name ?? m,
        values: byModel[m],
        color: modelColor(m, palette),
        width: 2,
        unit,
      })),
    [activeModels, byModel, palette, unit],
  )

  const spread = useMemo(() => modelSpread(byModel, forecast.hourly.time.length), [byModel, forecast.hourly.time.length])

  const spreadSeries: ChartSeries[] = useMemo(
    () => [
      {
        label: '模式最大差異',
        values: spread,
        color: palette.series[7],
        width: 2,
        fill: alpha(palette.series[7], 0.16),
        unit,
      },
    ],
    [spread, palette, unit],
  )

  const stats = useMemo(() => {
    const threshold = DIVERGENCE[variable] ?? 3
    // Only look forward: hours already behind us say nothing about what to trust.
    let divergeAt: number | null = null
    let alreadyDiverged = false
    for (let i = 0; i < spread.length; i++) {
      const s = spread[i]
      if (s == null || s < threshold) continue
      if (forecast.hourly.time[i] < nowMs) {
        alreadyDiverged = true
        continue
      }
      divergeAt = forecast.hourly.time[i]
      break
    }
    const finite = spread.filter((v): v is number => v != null)
    const peak = finite.length ? Math.max(...finite) : null
    const peakAt = peak != null ? forecast.hourly.time[spread.indexOf(peak)] : null
    const leadDays = divergeAt != null ? Math.max(0, (divergeAt - nowMs) / 86400000) : null
    return { threshold, divergeAt, peak, peakAt, leadDays, alreadyDiverged }
  }, [spread, variable, forecast.hourly.time, nowMs])

  return (
    <>
      <Card
        title="多模式比較"
        subtitle="同一地點、同一變數，各家全球模式的預報疊在一起。線條分岔的時間點就是這個地點的可預報度界線。"
        actions={
          <Segmented
            ariaLabel="選擇變數"
            value={variable}
            onChange={setVariable}
            options={COMPARE_VARS.filter((v) => forecast.hourly.vars[v]).map((v) => ({ value: v, label: VAR_LABELS[v] ?? v }))}
          />
        }
      >
        <div className="stat-grid stat-grid-4">
          <StatTile
            label="模式開始分歧"
            value={stats.leadDays == null ? '未分歧' : stats.leadDays < 0.05 ? '現在' : `+${stats.leadDays.toFixed(1)}`}
            unit={stats.leadDays != null && stats.leadDays >= 0.05 ? ' 天' : ''}
            note={
              stats.divergeAt != null
                ? `${dateTimeLabel(stats.divergeAt)} 起差異達 ${stats.threshold} ${unit}`
                : stats.alreadyDiverged
                  ? `僅在已過去的時段差異達 ${stats.threshold} ${unit}`
                  : `全期間差異都在 ${stats.threshold} ${unit} 內`
            }
            tone={stats.leadDays == null ? 'good' : stats.leadDays < 3 ? 'critical' : stats.leadDays < 7 ? 'warning' : 'good'}
          />
          <StatTile label="最大分歧" value={stats.peak != null ? stats.peak.toFixed(1) : '—'} unit={` ${unit}`} note={stats.peakAt != null ? dateTimeLabel(stats.peakAt) : undefined} />
          <StatTile label="納入比較的模式" value={String(activeModels.length)} unit=" 家" note={activeModels.map((m) => modelById(m)?.name ?? m).join('、')} />
          <StatTile
            label="最長預報時距"
            value={String(Math.max(...activeModels.map((m) => modelById(m)?.maxDays ?? 0)))}
            unit=" 天"
            note="各模式時距不同，短的線會提早結束"
          />
        </div>
      </Card>

      <Card title={`${VAR_LABELS[variable]} — 各模式疊圖`} subtitle={`單位 ${unit}・線條中斷代表該模式的預報時距已到`}>
        <Legend items={activeModels.map((m) => ({ label: modelById(m)?.name ?? m, color: modelColor(m, palette), note: `${modelById(m)?.maxDays} 天` }))} />
        <TimeChart time={forecast.hourly.time} series={series} palette={palette} unit={unit} height={320} markerAt={nowMs} />
      </Card>

      <Card title="模式間最大差異" subtitle={`同一時刻各模式的最大值減最小值・單位 ${unit}・數值越大代表這個時段越不可靠`}>
        <Legend items={[{ label: '模式最大差異', color: palette.series[7] }]} />
        <TimeChart time={forecast.hourly.time} series={spreadSeries} palette={palette} unit={unit} height={200} yMin={0} markerAt={nowMs} />
      </Card>

      <Card title="模式說明">
        <div className="model-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>模式</th>
                <th>發布單位</th>
                <th className="num">時距</th>
                <th className="num">解析度</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              {DETERMINISTIC.filter((m) => forecast.models.includes(m.id)).map((m) => (
                <tr key={m.id}>
                  <td>
                    <span className="legend-swatch" style={{ background: modelColor(m.id, palette) }} /> {m.name}
                  </td>
                  <td>{m.centre}</td>
                  <td className="num">{m.maxDays} 天</td>
                  <td className="num">{m.resolution}</td>
                  <td className="muted">{m.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
