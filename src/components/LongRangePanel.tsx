import { useMemo, useState } from 'react'
import { ensembleById } from '../lib/models'
import { alpha, type Palette } from '../lib/palette'
import { useClimatology, useEnsemble } from '../lib/hooks'
import type { Place } from '../lib/locations'
import { dayOfYear, trimNullTail } from '../lib/openmeteo'
import { confidence, dayLabel, quantile, spreadOf, weekdayLabel } from '../lib/weather'
import TimeChart, { type ChartBand, type ChartSeries } from './TimeChart'
import { Card, ErrorBox, Legend, Segmented, Spinner, StatTile } from './ui'

/** Only these two systems run out to 35 days. */
const LONG_MODELS = ['gem_global', 'gfs05']

type Metric = 'temperature_2m' | 'precipitation'

/**
 * Collapse hourly member series to one value per local day.
 * Temperature is averaged over the day; precipitation is summed. Days with fewer
 * than 18 of 24 hours present are dropped rather than reported as a low total.
 */
function toDaily(time: number[], members: (number | null)[][], mode: 'mean' | 'sum') {
  const dayKeys: number[] = []
  const index = new Map<number, number[]>()
  time.forEach((t, i) => {
    const day = Math.floor(t / 86400000) * 86400000
    if (!index.has(day)) {
      index.set(day, [])
      dayKeys.push(day)
    }
    index.get(day)!.push(i)
  })
  const daily = members.map((m) =>
    dayKeys.map((day) => {
      const idx = index.get(day)!
      const vals = idx.map((i) => m[i]).filter((v): v is number => v != null)
      if (vals.length < 18) return null
      return mode === 'sum' ? vals.reduce((a, v) => a + v, 0) : vals.reduce((a, v) => a + v, 0) / vals.length
    }),
  )
  return { days: dayKeys, daily }
}

export default function LongRangePanel({ place, palette, nowMs, windUnit }: { place: Place; palette: Palette; nowMs: number; windUnit: 'ms' | 'kmh' | 'kn' }) {
  const [model, setModel] = useState('gem_global')
  const [metric, setMetric] = useState<Metric>('temperature_2m')
  const def = ensembleById(model)!

  const ens = useEnsemble({ lat: place.lat, lon: place.lon, model, variable: metric, days: 35, windUnit })
  const clim = useClimatology(place.lat, place.lon)

  const view = useMemo(() => {
    if (!ens.data) return null
    const n = trimNullTail(ens.data.time, ens.data.members)
    const { days, daily } = toDaily(ens.data.time.slice(0, n), ens.data.members.map((m) => m.slice(0, n)), metric === 'precipitation' ? 'sum' : 'mean')
    const spread = spreadOf(daily, days.length)
    return { days, daily, spread, unit: ens.data.unit }
  }, [ens.data, metric])

  /** Climate normal aligned to the forecast days, and the median's departure from it. */
  const normals = useMemo(() => {
    if (!view || !clim.data) return null
    const base = view.days.map((d) => (metric === 'precipitation' ? clim.data!.precip : clim.data!.tmean)[dayOfYear(d)] ?? null)
    const anomaly = view.spread.median.map((m, i) => (m != null && base[i] != null ? m - base[i]! : null))
    return { base, anomaly }
  }, [view, clim.data, metric])

  const series: ChartSeries[] = useMemo(() => {
    if (!view) return []
    const c = palette.series[0]
    const out: ChartSeries[] = [
      { label: 'p90', values: view.spread.p90, color: c, boundary: true, hideInTooltip: true },
      { label: 'p10', values: view.spread.p10, color: c, boundary: true, hideInTooltip: true },
      { label: 'p75', values: view.spread.p75, color: c, boundary: true, hideInTooltip: true },
      { label: 'p25', values: view.spread.p25, color: c, boundary: true, hideInTooltip: true },
      { label: '系集中位數', values: view.spread.median, color: c, width: 2.5, unit: view.unit },
    ]
    if (normals) out.push({ label: `${clim.data?.years} 年氣候平均`, values: normals.base, color: palette.series[6], width: 2, dash: [6, 4], unit: view.unit })
    return out
  }, [view, normals, palette, clim.data?.years])

  const bands: ChartBand[] = useMemo(
    () => [
      { upper: 0, lower: 1, fill: alpha(palette.series[0], 0.14) },
      { upper: 2, lower: 3, fill: alpha(palette.series[0], 0.22) },
    ],
    [palette],
  )

  /**
   * Anomaly is a diverging quantity, so it gets two hues around a neutral zero —
   * split into two bar series because a single series can't carry per-bar colour.
   */
  const anomalySeries: ChartSeries[] = useMemo(() => {
    if (!normals) return []
    const warm = normals.anomaly.map((v) => (v != null && v > 0 ? v : null))
    const cool = normals.anomaly.map((v) => (v != null && v <= 0 ? v : null))
    return [
      { label: metric === 'precipitation' ? '較常年偏多' : '較常年偏暖', values: warm, color: palette.series[7], bars: true, fill: alpha(palette.series[7], 0.8), unit: view?.unit },
      { label: metric === 'precipitation' ? '較常年偏少' : '較常年偏冷', values: cool, color: palette.series[0], bars: true, fill: alpha(palette.series[0], 0.8), unit: view?.unit },
    ]
  }, [normals, palette, metric, view?.unit])

  /** Seven-day blocks from today — the honest resolution at this lead time. */
  const weeks = useMemo(() => {
    if (!view) return []
    const out: { label: string; start: number; end: number; median: number | null; p10: number | null; p90: number | null; anom: number | null; conf: ReturnType<typeof confidence> }[] = []
    for (let w = 0; w * 7 < view.days.length; w++) {
      const slice = view.days.slice(w * 7, w * 7 + 7)
      if (slice.length < 3) break
      const idx = slice.map((_, i) => w * 7 + i)
      const meds = idx.map((i) => view.spread.median[i])
      const agg = (xs: (number | null)[]) => {
        const f = xs.filter((v): v is number => v != null)
        if (!f.length) return null
        return metric === 'precipitation' ? f.reduce((a, v) => a + v, 0) : f.reduce((a, v) => a + v, 0) / f.length
      }
      const anoms = normals ? idx.map((i) => normals.anomaly[i]) : []
      out.push({
        label: `第 ${w + 1} 週`,
        start: slice[0],
        end: slice[slice.length - 1],
        median: agg(meds),
        p10: agg(idx.map((i) => view.spread.p10[i])),
        p90: agg(idx.map((i) => view.spread.p90[i])),
        anom: normals ? agg(anoms) : null,
        conf: confidence(quantile(idx.map((i) => view.spread.iqr90[i]), 0.5), metric),
      })
    }
    return out
  }, [view, normals, metric])

  const unit = view?.unit ?? ''
  const unitLabel = metric === 'precipitation' ? 'mm/日' : unit

  return (
    <>
      <Card
        title="35 天長期展望"
        subtitle="次季節（S2S）尺度的系集預報。這個時距已經無法預測「哪一天下雨」，只能回答「這幾週偏暖還是偏冷、偏濕還是偏乾」——所以這裡一律用週為單位，並和常年氣候值比較。"
        actions={
          <Segmented
            ariaLabel="選擇系集"
            value={model}
            onChange={(m) => setModel(m)}
            options={LONG_MODELS.map((id) => {
              const d = ensembleById(id)!
              return { value: id, label: d.name, title: `${d.centre}・${d.members} 成員` }
            })}
          />
        }
      >
        <div className="toolbar">
          <Segmented
            ariaLabel="選擇變數"
            value={metric}
            onChange={(m) => setMetric(m as Metric)}
            options={[
              { value: 'temperature_2m' as Metric, label: '氣溫' },
              { value: 'precipitation' as Metric, label: '降水' },
            ]}
          />
        </div>
        {weeks.length > 0 && (
          <div className="stat-grid stat-grid-4">
            {weeks.slice(0, 4).map((w) => (
              <StatTile
                key={w.label}
                label={`${w.label}（${dayLabel(w.start)}–${dayLabel(w.end)}）`}
                value={w.median != null ? w.median.toFixed(1) : '—'}
                unit={` ${unitLabel}`}
                note={
                  w.anom != null ? (
                    <>
                      {w.anom > 0 ? '較常年偏' + (metric === 'precipitation' ? '多 ' : '暖 ') : '較常年偏' + (metric === 'precipitation' ? '少 ' : '冷 ')}
                      {Math.abs(w.anom).toFixed(1)} {unit}・信心 {w.conf.level}
                    </>
                  ) : (
                    <>信心 {w.conf.level}</>
                  )
                }
              />
            ))}
          </div>
        )}
      </Card>

      {ens.loading && !view && <Spinner label={`載入 ${def.name} 的 35 天系集…`} />}
      {ens.error && <ErrorBox message={ens.error} onRetry={ens.reload} />}

      {view && (
        <>
          <Card title={`每日${metric === 'precipitation' ? '雨量' : '均溫'} — 系集分布 vs 常年氣候`} subtitle={`${def.name}・${def.members} 成員・單位 ${unitLabel}`}>
            <Legend
              items={[
                { label: '系集中位數', color: palette.series[0] },
                ...(normals ? [{ label: `${clim.data?.years} 年氣候平均（ERA5）`, color: palette.series[6], dash: true }] : []),
                { label: '25–75 百分位', color: alpha(palette.series[0], 0.45), swatch: 'band' as const },
                { label: '10–90 百分位', color: alpha(palette.series[0], 0.24), swatch: 'band' as const },
              ]}
            />
            <TimeChart time={view.days} series={series} bands={bands} palette={palette} unit={unit} height={320} markerAt={nowMs} yMin={metric === 'precipitation' ? 0 : undefined} />
            {clim.loading && <p className="hint">正在載入 ERA5 十年氣候基準（約 10 秒）…</p>}
            {clim.error && <p className="hint">氣候基準載入失敗：{clim.error}</p>}
          </Card>

          {anomalySeries.length > 0 && (
            <Card title="距平（與常年氣候的差距）" subtitle={`中位數減去 ${clim.data?.years} 年同日平均・單位 ${unit}・零線代表和常年一樣`}>
              <Legend items={anomalySeries.map((s) => ({ label: s.label, color: s.color, swatch: 'band' as const }))} />
              {/* yMin=yMax=0 forces zero into the scale so the bars grow from the zero line. */}
              <TimeChart time={view.days} series={anomalySeries} palette={palette} unit={unit} height={200} markerAt={nowMs} yMin={0} yMax={0} />
              <p className="hint">
                模式格點與 ERA5 的地形高度不同，長期系集本身也帶有系統性偏差；距平的<strong>方向與變化趨勢</strong>比絕對數值可靠。
              </p>
            </Card>
          )}

          <Card title="逐週摘要">
            <div className="model-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>期間</th>
                    <th className="num">{metric === 'precipitation' ? '週累積雨量（中位數）' : '週均溫（中位數）'}</th>
                    <th className="num">p10 – p90</th>
                    <th className="num">距平</th>
                    <th>信心度</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w) => (
                    <tr key={w.label}>
                      <td>
                        {w.label}　<span className="muted">{dayLabel(w.start)}（{weekdayLabel(w.start)}）– {dayLabel(w.end)}（{weekdayLabel(w.end)}）</span>
                      </td>
                      <td className="num">{w.median != null ? `${w.median.toFixed(1)} ${unitLabel}` : '—'}</td>
                      <td className="num muted">{w.p10 != null && w.p90 != null ? `${w.p10.toFixed(1)} – ${w.p90.toFixed(1)}` : '—'}</td>
                      <td className={`num${w.anom != null && Math.abs(w.anom) > 0.5 ? (w.anom > 0 ? ' anom-warm' : ' anom-cool') : ''}`}>
                        {w.anom != null ? `${w.anom > 0 ? '+' : ''}${w.anom.toFixed(1)} ${unit}` : '—'}
                      </td>
                      <td>
                        <span className={`chip tone-${w.conf.tone}`}>{w.conf.level}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  )
}
