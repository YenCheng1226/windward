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
import { STATUS_LABEL, type ActivityOutlook, type DayAssessment, type Status } from '../lib/risk'
import type { Cyclone } from '../lib/tropical'

const SANS = 'system-ui, -apple-system, "Noto Sans TC", sans-serif'

export function statusColor(status: Status, p: Palette): string {
  return status === 'blocked' || status === 'poor' ? p.critical : status === 'caution' ? p.warning : p.good
}

const dayLabel = (ms: number) => `${new Date(ms).getUTCMonth() + 1}/${new Date(ms).getUTCDate()}`
const weekday = (ms: number) => '日一二三四五六'[new Date(ms).getUTCDay()]

// ------------------------------------------------------------ status strip

export interface StripProps {
  days: DayAssessment[]
  palette: Palette
  width?: number
  ref?: Ref<SVGSVGElement>
}

/** Break a string into lines of at most `max` characters, counting CJK as one. */
function wrap(text: string, max: number, limit: number): string[] {
  const out: string[] = []
  let line = ''
  for (const ch of text) {
    if (line.length >= max) {
      out.push(line)
      line = ''
      if (out.length === limit) return out
    }
    line += ch
  }
  if (line && out.length < limit) out.push(line)
  return out
}

/**
 * One column per day: status, what happens, and what still works.
 *
 * Deliberately carries no score. A 0–100 figure ranked the days but told the reader
 * nothing about why or what to do, and invited precision the inputs cannot support;
 * the words are the content, and the colour is only there to let the shape of the
 * trip register before the text is read.
 */
export function RiskStrip({ days, palette: p, width = 780, ref }: StripProps) {
  const H = 210
  const padL = 10
  const padR = 10
  const n = Math.max(1, days.length)
  const colW = (width - padL - padR) / n
  const blockW = Math.min(168, colW - 12)
  const blockY = 44
  const blockH = 44

  return (
    <svg ref={ref} viewBox={`0 0 ${width} ${H}`} width="100%" role="img" aria-label="逐日行程狀態" style={{ display: 'block' }}>
      <rect x="0" y="0" width={width} height={H} fill={p.surface1} />
      {days.map((d, i) => {
        const cx = padL + colW * i + colW / 2
        const color = d.outOfRange ? p.textMuted : statusColor(d.status, p)
        const label = d.outOfRange ? '無預報' : STATUS_LABEL[d.status]
        const verdict = d.outOfRange ? (d.entersRange ? `${d.entersRange} 起有資料` : '') : d.verdict
        return (
          <g key={d.day}>
            <text x={cx} y={20} fontSize="14" fontWeight="700" textAnchor="middle" fill={p.textPrimary} fontFamily={SANS}>
              {dayLabel(d.day)}
            </text>
            <text x={cx} y={34} fontSize="10" textAnchor="middle" fill={p.textMuted} fontFamily={SANS}>
              週{weekday(d.day)}
            </text>
            <rect x={cx - blockW / 2} y={blockY} width={blockW} height={blockH} rx="7" fill={color} opacity={d.outOfRange ? 0.16 : 0.9} />
            <text
              x={cx}
              y={blockY + 28}
              fontSize="15"
              fontWeight="700"
              textAnchor="middle"
              fill={d.outOfRange ? p.textMuted : p.surface1}
              fontFamily={SANS}
            >
              {label}
            </text>
            {wrap(verdict, Math.floor(blockW / 11.5), 3).map((line, li) => (
              <text key={li} x={cx} y={blockY + blockH + 20 + li * 15} fontSize="11" textAnchor="middle" fill={p.textSecondary} fontFamily={SANS}>
                {line}
              </text>
            ))}
            {!d.outOfRange && d.stillWorks && (
              wrap(`仍可行：${d.stillWorks}`, Math.floor(blockW / 9.2), 2).map((line, li) => (
                <text key={`w${li}`} x={cx} y={blockY + blockH + 74 + li * 13} fontSize="9.5" textAnchor="middle" fill={p.textMuted} fontFamily={SANS}>
                  {line}
                </text>
              ))
            )}
          </g>
        )
      })}
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


// ------------------------------------------------------- destination plot

export interface DestinationProps {
  place: string
  /** Dominant swell direction (degrees the waves come from) and the sheltered shore. */
  shore: { exposed: string; lee: string; waveFrom: number } | null
  waveOffshore: number | null
  waveLee: number | null
  sun: { hours: number; frac: number; day: number } | null
  outlook: ActivityOutlook[]
  palette: Palette
  width?: number
  ref?: Ref<SVGSVGElement>
}

const OUTLOOK_TEXT: Record<ActivityOutlook['status'], string> = { ok: '可行', marginal: '勉強', no: '不可行' }

/**
 * The destination, drawn as the trip actually works: which shore the swell hits,
 * which shore is therefore sheltered, and what each activity can expect.
 *
 * This replaced a cyclone radar on the report. The radar answered "where are the
 * typhoons", which is only interesting when there is one; this answers "which side of
 * the island do I go to, and what can I do", which is the question every single time.
 * It is a schematic — the island is a stylised shape, not a coastline.
 */
export function DestinationPlot({ place, shore, waveOffshore, waveLee, sun, outlook, palette: p, width = 780, ref }: DestinationProps) {
  const H = 352
  const cx = 190
  const cy = 158
  const rx = 74
  const ry = 60
  const ring = 118

  // Screen angle for a compass bearing, with north up.
  const ang = (deg: number) => (deg - 90) * (Math.PI / 180)
  const from = shore?.waveFrom ?? null
  const land = p.mode === 'dark' ? '#2c3a33' : '#e4e9e0'

  const arrows = from == null ? [] : [-22, 0, 22].map((off) => {
    const a = ang(from + off)
    const x0 = cx + Math.cos(a) * (ring + 26)
    const y0 = cy + Math.sin(a) * (ring + 26)
    const x1 = cx + Math.cos(a) * (rx + 16)
    const y1 = cy + Math.sin(a) * (ry + 16)
    return { x0, y0, x1, y1 }
  })

  const leeAngle = from == null ? null : ang(from + 180)

  return (
    <svg ref={ref} viewBox={`0 0 ${width} ${H}`} width="100%" role="img" aria-label={`${place}的海況與活動示意圖`} style={{ display: 'block' }}>
      <defs>
        <marker id="swell" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={p.series[0]} />
        </marker>
      </defs>
      <rect x="0" y="0" width={width} height={H} fill={p.surface1} />

      <text x="16" y="24" fontSize="12" fontWeight="700" fill={p.textPrimary} fontFamily={SANS}>
        海況與建議方位
      </text>

      {['北', '東', '南', '西'].map((d, i) => {
        const a = ang(i * 90)
        return (
          <text key={d} x={cx + Math.cos(a) * (ring + 14)} y={cy + Math.sin(a) * (ring + 14) + 4} fontSize="10" textAnchor="middle" fill={p.textMuted} fontFamily={SANS}>
            {d}
          </text>
        )
      })}
      <circle cx={cx} cy={cy} r={ring} fill="none" stroke={p.grid} strokeWidth="1" />

      {arrows.map((a, i) => (
        <line key={i} x1={a.x0} y1={a.y0} x2={a.x1} y2={a.y1} stroke={p.series[0]} strokeWidth="2" markerEnd="url(#swell)" opacity="0.85" />
      ))}

      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={land} stroke={p.axis} strokeWidth="1.5" />
      <text x={cx} y={cy + 5} fontSize="14" fontWeight="700" textAnchor="middle" fill={p.textPrimary} fontFamily={SANS}>
        {place}
      </text>

      {from != null && (
        <>
          {/* The exposed arc is drawn as a thick cap on the swell-facing side. */}
          <path
            d={`M ${cx + Math.cos(ang(from - 55)) * rx} ${cy + Math.sin(ang(from - 55)) * ry} A ${rx} ${ry} 0 0 1 ${cx + Math.cos(ang(from + 55)) * rx} ${cy + Math.sin(ang(from + 55)) * ry}`}
            fill="none"
            stroke={p.critical}
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.75"
            transform={`rotate(${from > 180 ? 0 : 0} ${cx} ${cy})`}
          />
          <text
            x={cx + Math.cos(ang(from)) * (rx + 42)}
            y={cy + Math.sin(ang(from)) * (ry + 42)}
            fontSize="10.5"
            fontWeight="600"
            textAnchor="middle"
            fill={p.critical}
            fontFamily={SANS}
          >
            {shore!.exposed}岸迎浪
          </text>
          {leeAngle != null && (
            <>
              <circle cx={cx + Math.cos(leeAngle) * (rx * 0.72)} cy={cy + Math.sin(leeAngle) * (ry * 0.72)} r="5" fill={p.good} />
              <text
                x={cx + Math.cos(leeAngle) * (rx + 48)}
                y={cy + Math.sin(leeAngle) * (ry + 48)}
                fontSize="10.5"
                fontWeight="600"
                textAnchor="middle"
                fill={p.good}
                fontFamily={SANS}
              >
                {shore!.lee}岸背風・建議潛點
              </text>
            </>
          )}
        </>
      )}

      <text x="16" y={H - 30} fontSize="10.5" fill={p.textSecondary} fontFamily={SANS}>
        {waveOffshore != null && waveLee != null
          ? `行程期間中位數：外海浪高 ${waveOffshore.toFixed(1)} m → 背風側估計 ${waveLee.toFixed(1)} m`
          : '浪高資料不足'}
      </text>
      <text x="16" y={H - 14} fontSize="10" fill={p.textMuted} fontFamily={SANS}>
        島形為示意，非實際海岸線；背風遮蔽為依週期估算的概略值
      </text>

      {/* Activity outlook — icons carry recognition, the words carry the verdict. */}
      <text x="400" y="24" fontSize="12" fontWeight="700" fill={p.textPrimary} fontFamily={SANS}>
        活動可行性（全程最佳時段）
      </text>
      {outlook.map((o, i) => {
        const y = 52 + i * 40
        const color = o.status === 'ok' ? p.good : o.status === 'marginal' ? p.warning : p.critical
        return (
          <g key={o.id}>
            <rect x="400" y={y - 16} width={width - 416} height="32" rx="7" fill={p.surface2} />
            <text x="416" y={y + 6} fontSize="17" fontFamily={SANS}>
              {o.icon}
            </text>
            <text x="446" y={y + 5} fontSize="12.5" fontWeight="600" fill={p.textPrimary} fontFamily={SANS}>
              {o.name}
            </text>
            <text x="536" y={y + 5} fontSize="12" fontWeight="700" fill={color} fontFamily={SANS}>
              {OUTLOOK_TEXT[o.status]}
            </text>
            <text x={width - 26} y={y + 5} fontSize="10.5" textAnchor="end" fill={p.textMuted} fontFamily={SANS}>
              {/* A "best" of zero is not a recommendation — say there isn't one. */}
              {o.bestScore == null ? '無可用資料' : o.bestScore > 0 && o.bestDay != null ? `最佳 ${dayLabel(o.bestDay)} ${o.bestPart}（${o.bestScore} 分）` : '全程無可行時段'}
            </text>
          </g>
        )
      })}
      {sun && (
        <text x="400" y={52 + outlook.length * 40 + 6} fontSize="10.5" fill={p.textSecondary} fontFamily={SANS}>
          {`曬太陽最好的是 ${dayLabel(sun.day)}：${sun.hours.toFixed(1)} 小時日照，佔白天 ${(sun.frac * 100).toFixed(0)}%`}
        </text>
      )}
    </svg>
  )
}
