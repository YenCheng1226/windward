/**
 * The two diagrams on the risk page.
 *
 * Both are hand-authored SVG with **literal colour attributes** rather than CSS
 * variables. That is deliberate: the export path serialises these nodes into a
 * standalone image, and a `var(--…)` reference resolves to nothing once the node
 * leaves the document. Colours are passed in from the active palette instead.
 */
import type { Ref } from 'react'
import type { Palette } from '../lib/palette'
import type { DayRisk, RiskLevel } from '../lib/risk'
import type { Cyclone } from '../lib/tropical'

const SANS = 'system-ui, -apple-system, "Noto Sans TC", sans-serif'

export function riskColor(level: RiskLevel, p: Palette): string {
  return level === '極高' ? p.critical : level === '高' ? p.critical : level === '中' ? p.warning : p.good
}

const dayLabel = (ms: number) => `${new Date(ms).getUTCMonth() + 1}/${new Date(ms).getUTCDate()}`
const weekday = (ms: number) => '日一二三四五六'[new Date(ms).getUTCDay()]

// ------------------------------------------------------------ risk timeline

export interface TimelineProps {
  days: DayRisk[]
  palette: Palette
  width?: number
  /** React 19 passes ref as a plain prop; the export path needs the live node. */
  ref?: Ref<SVGSVGElement>
}

/**
 * Risk across the trip, one column per day. Height encodes the score and colour
 * encodes the band, so the shape reads before any number does; the dominant driver
 * is printed under each column because "which day" without "why" isn't actionable.
 */
export function RiskTimeline({ days, palette: p, width = 760, ref }: TimelineProps) {
  const H = 210
  const padL = 8
  const padR = 8
  const top = 30
  const baseY = 150
  const plotH = baseY - top
  const n = Math.max(1, days.length)
  const colW = (width - padL - padR) / n
  const barW = Math.min(88, colW - 14)

  return (
    <svg ref={ref} viewBox={`0 0 ${width} ${H}`} width="100%" role="img" aria-label="逐日行程風險" style={{ display: 'block' }}>
      <rect x="0" y="0" width={width} height={H} fill={p.surface1} />
      {[0, 25, 50, 75, 100].map((v) => {
        const y = baseY - (v / 100) * plotH
        return (
          <g key={v}>
            <line x1={padL} x2={width - padR} y1={y} y2={y} stroke={p.grid} strokeWidth="1" />
            <text x={padL + 2} y={y - 3} fontSize="9" fill={p.textMuted} fontFamily={SANS}>{v}</text>
          </g>
        )
      })}
      {days.map((d, i) => {
        const cx = padL + colW * i + colW / 2
        const h = d.outOfRange ? 0 : Math.max(3, (d.score / 100) * plotH)
        const color = d.outOfRange ? p.textMuted : riskColor(d.level, p)
        return (
          <g key={d.day}>
            <text x={cx} y={16} fontSize="12" fontWeight="600" textAnchor="middle" fill={p.textPrimary} fontFamily={SANS}>
              {dayLabel(d.day)}
            </text>
            <text x={cx} y={27} fontSize="9" textAnchor="middle" fill={p.textMuted} fontFamily={SANS}>
              週{weekday(d.day)}
            </text>
            {d.outOfRange ? (
              <text x={cx} y={baseY - 6} fontSize="10" textAnchor="middle" fill={p.textMuted} fontFamily={SANS}>無預報</text>
            ) : (
              <>
                <rect x={cx - barW / 2} y={baseY - h} width={barW} height={h} rx="4" fill={color} opacity="0.85" />
                {/* A tall bar leaves no room above it — the label moves inside rather
                    than colliding with the date heading. */}
                {h > plotH - 22 ? (
                  <text x={cx} y={baseY - h + 15} fontSize="12" fontWeight="700" textAnchor="middle" fill={p.surface1} fontFamily={SANS}>
                    {d.score}
                  </text>
                ) : (
                  <text x={cx} y={baseY - h - 6} fontSize="12" fontWeight="700" textAnchor="middle" fill={color} fontFamily={SANS}>
                    {d.score}
                  </text>
                )}
              </>
            )}
            <line x1={cx - barW / 2} x2={cx + barW / 2} y1={baseY} y2={baseY} stroke={p.axis} strokeWidth="1" />
            <text x={cx} y={baseY + 16} fontSize="11" fontWeight="600" textAnchor="middle" fill={d.outOfRange ? p.textMuted : color} fontFamily={SANS}>
              {d.outOfRange ? '—' : d.level}
            </text>
            <text x={cx} y={baseY + 31} fontSize="9.5" textAnchor="middle" fill={p.textSecondary} fontFamily={SANS}>
              {d.outOfRange ? '' : (d.dominant?.label ?? '')}
            </text>
            {!d.outOfRange && d.bestActivity && (
              <text x={cx} y={baseY + 45} fontSize="9" textAnchor="middle" fill={p.textMuted} fontFamily={SANS}>
                {/* "最佳 自由潛水 0" reads as a recommendation; zero means nothing works. */}
                {d.bestActivity.score > 0 ? `最佳 ${d.bestActivity.name} ${d.bestActivity.score}` : '無可行活動'}
              </text>
            )}
          </g>
        )
      })}
      <text x={padL} y={H - 4} fontSize="9" fill={p.textMuted} fontFamily={SANS}>
        風險分數 0–100，越高代表行程越可能受影響
      </text>
    </svg>
  )
}

// --------------------------------------------------------- situation plot

export interface SituationProps {
  place: string
  cyclones: Cyclone[]
  palette: Palette
  size?: number
  ref?: Ref<SVGSVGElement>
}

const RINGS = [250, 500, 1000, 2000, 4000]

/** Log-scaled radius: near systems need resolution, far ones only need to be "far". */
function radiusFor(km: number, maxR: number): number {
  const clamped = Math.min(Math.max(km, 30), 5000)
  return (Math.log(1 + clamped / 120) / Math.log(1 + 5000 / 120)) * maxR
}


/**
 * Where the tropical systems are, relative to the trip. Distance is log-scaled and
 * bearing is true, so this is a schematic of the situation — not a map. It answers
 * "is anything close, and is it pointing at us", which is the only geographic
 * question that matters before a warning exists.
 */
export function SituationPlot({ place, cyclones, palette: p, size = 420, ref }: SituationProps) {
  const c = size / 2
  const maxR = size / 2 - 34
  const scaleOf = (cy: Cyclone) => (cy.cwaScale === '強烈颱風' ? 13 : cy.cwaScale === '中度颱風' ? 11 : cy.cwaScale === '輕度颱風' ? 9 : 7)
  const colorOf = (cy: Cyclone) => (cy.distanceKm <= 400 ? p.critical : cy.distanceKm <= 1000 ? p.warning : p.series[0])

  return (
    <svg ref={ref} viewBox={`0 0 ${size} ${size}`} width="100%" role="img" aria-label={`熱帶系統相對${place}的位置示意圖`} style={{ display: 'block', maxWidth: size, margin: '0 auto' }}>
      <rect x="0" y="0" width={size} height={size} fill={p.surface1} />
      {RINGS.map((km) => {
        const r = radiusFor(km, maxR)
        return (
          <g key={km}>
            <circle cx={c} cy={c} r={r} fill="none" stroke={p.grid} strokeWidth="1" />
            <text x={c + 3} y={c - r + 11} fontSize="9" fill={p.textMuted} fontFamily={SANS}>
              {km.toLocaleString()} km
            </text>
          </g>
        )
      })}
      {['北', '東', '南', '西'].map((d, i) => {
        const a = (i * 90 - 90) * (Math.PI / 180)
        return (
          <text key={d} x={c + Math.cos(a) * (maxR + 16)} y={c + Math.sin(a) * (maxR + 16) + 4} fontSize="10" textAnchor="middle" fill={p.textMuted} fontFamily={SANS}>
            {d}
          </text>
        )
      })}
      <line x1={c} y1={c - maxR} x2={c} y2={c + maxR} stroke={p.grid} strokeWidth="1" />
      <line x1={c - maxR} y1={c} x2={c + maxR} y2={c} stroke={p.grid} strokeWidth="1" />

      <circle cx={c} cy={c} r="5" fill={p.textPrimary} />
      <text x={c} y={c + 19} fontSize="11" fontWeight="600" textAnchor="middle" fill={p.textPrimary} fontFamily={SANS}>
        {place}
      </text>
      {cyclones.map((cy) => {
        const r = radiusFor(cy.distanceKm, maxR)
        const a = (cy.bearingDeg - 90) * (Math.PI / 180)
        const x = c + Math.cos(a) * r
        const y = c + Math.sin(a) * r
        const col = colorOf(cy)
        const trackPts = cy.track
          .filter((t) => t.hours > 0)
          .map((t) => {
            const tr = radiusFor(t.distanceKm, maxR)
            const ta = (t.bearingDeg - 90) * (Math.PI / 180)
            return `${(c + Math.cos(ta) * tr).toFixed(1)},${(c + Math.sin(ta) * tr).toFixed(1)}`
          })
        return (
          <g key={cy.id}>
            {trackPts.length > 0 && (
              <polyline points={`${x.toFixed(1)},${y.toFixed(1)} ${trackPts.join(' ')}`} fill="none" stroke={col} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.65" />
            )}
            {trackPts.map((pt, j) => {
              const [px, py] = pt.split(',').map(Number)
              return <circle key={j} cx={px} cy={py} r="2.5" fill={col} opacity="0.45" />
            })}
            <circle cx={x} cy={y} r={scaleOf(cy)} fill={col} opacity="0.22" />
            <circle cx={x} cy={y} r="4.5" fill={col} />
            <text x={x} y={y - scaleOf(cy) - 5} fontSize="10" fontWeight="600" textAnchor="middle" fill={col} fontFamily={SANS}>
              {cy.nameEn}
            </text>
            <text x={x} y={y + scaleOf(cy) + 12} fontSize="9" textAnchor="middle" fill={p.textSecondary} fontFamily={SANS}>
              {Math.round(cy.distanceKm).toLocaleString()} km
            </text>
            <title>{`${cy.nameEn}（${cy.cwaScale}）距離 ${Math.round(cy.distanceKm)} km，位於${cy.bearing}方`}</title>
          </g>
        )
      })}
      <text x="8" y={size - 8} fontSize="9" fill={p.textMuted} fontFamily={SANS}>
        距離為對數尺度・方位為真方位・虛線為預報路徑
      </text>
    </svg>
  )
}
