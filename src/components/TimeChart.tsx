import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { Palette } from '../lib/palette'
import { dateTimeLabel, dayLabel, hourLabel, weekdayLabel } from '../lib/weather'

export interface ChartSeries {
  label: string
  values: (number | null)[]
  color: string
  /** Line weight in px. Spaghetti members use 1; headline series use 2. */
  width?: number
  dash?: number[]
  /** Draw as bars instead of a line — used for precipitation. */
  bars?: boolean
  /** Fill under the line, as an rgba string. */
  fill?: string
  /** Hidden boundary series that only exists to anchor a band. */
  boundary?: boolean
  /** Suppress this series in the tooltip (spaghetti members would flood it). */
  hideInTooltip?: boolean
  unit?: string
}

export interface ChartBand {
  /** Indices into `series` (0-based, excluding the x axis). Upper first. */
  upper: number
  lower: number
  fill: string
}

export interface TimeChartProps {
  /** Shifted-to-local timestamps in ms (see openmeteo.ts). */
  time: number[]
  series: ChartSeries[]
  bands?: ChartBand[]
  height?: number
  unit?: string
  palette: Palette
  /** Draw a vertical rule at this timestamp — used for "now" and day boundaries. */
  markerAt?: number
  /** Force the y range to include these values (e.g. 0 for precipitation). */
  yMin?: number
  yMax?: number
  /** Vertical shading every other day, so 15-day charts stay readable. */
  dayStripes?: boolean
}

const HOUR = 3600
const X_INCRS = [HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, 24 * HOUR, 2 * 24 * HOUR, 3 * 24 * HOUR, 7 * 24 * HOUR]

/** Alternating day shading, drawn under the data so long charts have a day rhythm. */
function dayStripePlugin(palette: Palette): uPlot.Plugin {
  return {
    hooks: {
      drawClear: (u) => {
        const ctx = u.ctx
        const [min, max] = u.scales.x!.min != null ? [u.scales.x!.min!, u.scales.x!.max!] : [0, 0]
        if (!max) return
        ctx.save()
        ctx.fillStyle = palette.mode === 'light' ? 'rgba(11,11,11,0.022)' : 'rgba(255,255,255,0.028)'
        const dayMs = 86400
        let d = Math.floor(min / dayMs) * dayMs
        let i = 0
        while (d < max) {
          if (i % 2 === 1) {
            const x0 = u.valToPos(Math.max(d, min), 'x', true)
            const x1 = u.valToPos(Math.min(d + dayMs, max), 'x', true)
            ctx.fillRect(x0, u.bbox.top, x1 - x0, u.bbox.height)
          }
          d += dayMs
          i++
        }
        ctx.restore()
      },
    },
  }
}

function markerPlugin(at: number, palette: Palette): uPlot.Plugin {
  return {
    hooks: {
      draw: (u) => {
        const x = u.valToPos(at / 1000, 'x', true)
        if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) return
        u.ctx.save()
        u.ctx.strokeStyle = palette.textMuted
        u.ctx.setLineDash([3, 3])
        u.ctx.lineWidth = 1
        u.ctx.beginPath()
        u.ctx.moveTo(x, u.bbox.top)
        u.ctx.lineTo(x, u.bbox.top + u.bbox.height)
        u.ctx.stroke()
        u.ctx.restore()
      },
    },
  }
}

/**
 * Crosshair tooltip. The DOM node is written to directly rather than through React
 * state — the cursor fires on every mousemove and a re-render per frame is wasteful.
 */
function tooltipPlugin(series: ChartSeries[], unit: string): uPlot.Plugin {
  let el: HTMLDivElement
  return {
    hooks: {
      init: (u) => {
        el = document.createElement('div')
        el.className = 'chart-tooltip'
        el.style.display = 'none'
        u.over.appendChild(el)
      },
      setCursor: (u) => {
        const { idx, left, top } = u.cursor
        if (idx == null || left == null || left < 0) {
          el.style.display = 'none'
          return
        }
        const ts = (u.data[0][idx] as number) * 1000
        const rows = series
          .map((s, i) => ({ s, v: u.data[i + 1]?.[idx] as number | null | undefined }))
          .filter(({ s, v }) => !s.boundary && !s.hideInTooltip && v != null)
          .map(({ s, v }) => `<div class="tt-row"><span class="tt-swatch" style="background:${s.color}"></span><span class="tt-name">${s.label}</span><span class="tt-val">${(v as number).toFixed(1)}<span class="tt-unit">${s.unit ?? unit}</span></span></div>`)
          .join('')
        if (!rows) {
          el.style.display = 'none'
          return
        }
        el.innerHTML = `<div class="tt-head">${dateTimeLabel(ts)}</div>${rows}`
        el.style.display = 'block'
        // Flip to the left of the cursor near the right edge so the box stays on-canvas.
        const flip = left > u.over.clientWidth - 180
        el.style.left = `${left + (flip ? -12 - el.offsetWidth : 12)}px`
        el.style.top = `${Math.min(Math.max(top ?? 0, 8), u.over.clientHeight - el.offsetHeight - 8)}px`
      },
      setSize: (u) => {
        if (el.parentNode !== u.over) u.over.appendChild(el)
      },
    },
  }
}

export default function TimeChart({ time, series, bands = [], height = 260, unit = '', palette, markerAt, yMin, yMax, dayStripes = true }: TimeChartProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || !time.length) return

    const xs = time.map((t) => t / 1000)
    const data = [xs, ...series.map((s) => s.values)] as unknown as uPlot.AlignedData

    const plugins: uPlot.Plugin[] = [tooltipPlugin(series, unit)]
    if (dayStripes) plugins.unshift(dayStripePlugin(palette))
    if (markerAt != null) plugins.push(markerPlugin(markerAt, palette))

    const opts: uPlot.Options = {
      width: host.clientWidth,
      height,
      padding: [12, 8, 0, 0],
      cursor: {
        y: false,
        points: { size: 7, width: 2, stroke: () => palette.surface1 },
        drag: { x: true, y: false, setScale: true },
      },
      legend: { show: false },
      scales: {
        x: { time: false },
        y: {
          range: (_u, dataMin, dataMax) => {
            const lo = yMin != null ? Math.min(yMin, dataMin) : dataMin
            const hi = yMax != null ? Math.max(yMax, dataMax) : dataMax
            if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1]
            const pad = (hi - lo) * 0.08 || 1
            return [lo - pad, hi + pad]
          },
        },
      },
      series: [
        {},
        ...series.map((s): uPlot.Series => ({
          label: s.label,
          stroke: s.boundary ? 'transparent' : s.color,
          width: s.width ?? 2,
          dash: s.dash,
          fill: s.fill,
          points: { show: false },
          paths: s.bars ? uPlot.paths.bars!({ size: [0.85, 24], align: 0 }) : undefined,
          // Gaps are real: a shorter model must break the line, not bridge it.
          spanGaps: false,
        })),
      ],
      bands: bands.map((b) => ({ series: [b.upper + 1, b.lower + 1] as [number, number], fill: b.fill })),
      axes: [
        {
          stroke: palette.textMuted,
          grid: { stroke: palette.grid, width: 1 },
          ticks: { stroke: palette.axis, width: 1, size: 4 },
          font: '11px system-ui, -apple-system, sans-serif',
          incrs: X_INCRS,
          space: 64,
          values: (_u, splits) =>
            splits.map((s) => {
              const ms = s * 1000
              const d = new Date(ms)
              // Midnight ticks carry the date; intra-day ticks carry the hour.
              return d.getUTCHours() === 0 ? `${dayLabel(ms)}\n${weekdayLabel(ms)}` : hourLabel(ms)
            }),
        },
        {
          stroke: palette.textMuted,
          grid: { stroke: palette.grid, width: 1 },
          ticks: { show: false },
          font: '11px system-ui, -apple-system, sans-serif',
          size: 48,
          values: (_u, splits) => splits.map((v) => (Math.abs(v) >= 100 ? v.toFixed(0) : String(+v.toFixed(1)))),
        },
      ],
      plugins,
    }

    const plot = new uPlot(opts, data, host)
    plotRef.current = plot

    const ro = new ResizeObserver(() => plot.setSize({ width: host.clientWidth, height }))
    ro.observe(host)
    return () => {
      ro.disconnect()
      plot.destroy()
      plotRef.current = null
    }
  }, [time, series, bands, height, unit, palette, markerAt, yMin, yMax, dayStripes])

  return <div className="chart-host" ref={hostRef} />
}
