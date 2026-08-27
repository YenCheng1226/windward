import type { ReactNode } from 'react'

export function Card({ title, subtitle, actions, children, wide }: { title?: string; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; wide?: boolean }) {
  return (
    <section className={`card${wide ? ' card-wide' : ''}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export interface LegendItem {
  label: string
  color: string
  dash?: boolean
  /** Rendered as a filled block rather than a line — for bands and areas. */
  swatch?: 'band'
  note?: string
}

/**
 * A legend is present whenever two or more series share an axis, so identity is
 * never carried by colour alone.
 */
export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="legend">
      {items.map((it) => (
        <li key={it.label + it.color}>
          <span
            className={`legend-swatch${it.swatch === 'band' ? ' legend-band' : ''}${it.dash ? ' legend-dash' : ''}`}
            style={{ background: it.color }}
          />
          <span>{it.label}</span>
          {it.note && <em className="legend-note">{it.note}</em>}
        </li>
      ))}
    </ul>
  )
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: string; title?: string }[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          title={o.title}
          aria-selected={o.value === value}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function StatTile({ label, value, unit, note, tone }: { label: string; value: string; unit?: string; note?: ReactNode; tone?: 'good' | 'warning' | 'critical' }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </span>
      {note && <span className={`stat-note${tone ? ' tone-' + tone : ''}`}>{note}</span>}
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner-dot" />
      {label}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="errorbox" role="alert">
      <strong>載入失敗</strong>
      <span>{message}</span>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          重試
        </button>
      )}
    </div>
  )
}
