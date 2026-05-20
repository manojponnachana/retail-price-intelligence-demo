/**
 * ui.jsx — shared primitives
 * KpiCard, Delta, QualityBadge, Spinner, EmptyState, PageHeader
 */

import React from 'react'
import clsx from 'clsx'
import { Loader2, AlertCircle } from 'lucide-react'

// ── KPI Card ──────────────────────────────────────────────────────────────────

export function KpiCard({ label, value, delta, deltaSuffix = '%', accent = false, sub }) {
  return (
    <div className="kpi-card" style={accent ? { '--card-accent': 'var(--signal)' } : {}}>
      <div className="metric-label mb-2">{label}</div>
      <div className="metric-value">{value ?? '—'}</div>
      {delta != null && (
        <div className={clsx('text-xs font-mono mt-1.5 flex items-center gap-1',
             delta > 0 ? 'delta-pos' : delta < 0 ? 'delta-neg' : 'delta-neu')}>
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '●'}
          {' '}{Math.abs(delta).toFixed(1)}{deltaSuffix}
        </div>
      )}
      {sub && <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>{sub}</div>}
    </div>
  )
}

// ── Delta chip ────────────────────────────────────────────────────────────────

export function Delta({ value, suffix = '%', size = 'sm' }) {
  if (value == null) return <span className="text-dim">—</span>
  const pos = value > 0
  const neg = value < 0
  return (
    <span className={clsx(
      'font-mono inline-flex items-center gap-0.5',
      size === 'sm' ? 'text-xs' : 'text-sm',
      pos ? 'delta-pos' : neg ? 'delta-neg' : 'delta-neu'
    )}>
      {pos ? '▲' : neg ? '▼' : '●'}
      {Math.abs(value).toFixed(1)}{suffix}
    </span>
  )
}

// ── Quality badge ─────────────────────────────────────────────────────────────

const QUALITY_MAP = {
  RELIABLE      : { cls: 'badge-reliable',   label: 'Reliable'   },
  MARGINAL      : { cls: 'badge-marginal',   label: 'Marginal'   },
  UNRELIABLE    : { cls: 'badge-unreliable', label: 'Unreliable' },
  PRICE_INVARIANT: { cls: 'badge-invariant', label: 'No Variation' },
}

export function QualityBadge({ quality }) {
  const cfg = QUALITY_MAP[quality] || { cls: 'badge-invariant', label: quality || '—' }
  return <span className={clsx('badge', cfg.cls)}>{cfg.label}</span>
}

// ── Tier badge ────────────────────────────────────────────────────────────────

const TIER_MAP = {
  SKVI: { bg: 'rgba(79,195,247,0.12)', color: 'var(--sky)'    },
  KVI : { bg: 'rgba(0,229,160,0.12)', color: 'var(--signal)'  },
  NKVI: { bg: 'rgba(80,90,107,0.2)',  color: 'var(--text-sec)'},
}
export function TierBadge({ tier }) {
  const s = TIER_MAP[tier] || TIER_MAP.NKVI
  return (
    <span className="badge" style={{ background: s.bg, color: s.color }}>
      {tier || '—'}
    </span>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────

export function Spinner({ size = 20, className = '' }) {
  return (
    <Loader2 size={size} className={clsx('animate-spin', className)}
             style={{ color: 'var(--signal)' }} />
  )
}

// ── Loading overlay ───────────────────────────────────────────────────────────

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <Spinner size={24} />
      <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>{label}</span>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({ label = 'No data', sub }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20">
      <AlertCircle size={20} style={{ color: 'var(--text-dim)' }} />
      <span className="text-sm font-mono" style={{ color: 'var(--text-sec)' }}>{label}</span>
      {sub && <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>{sub}</span>}
    </div>
  )
}

// ── Page header ───────────────────────────────────────────────────────────────

export function PageHeader({ title, sub, children }) {
  return (
    <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b"
         style={{ borderColor: 'var(--border)' }}>
      <div>
        <h1 className="font-mono text-lg font-medium text-pri leading-none">{title}</h1>
        {sub && (
          <p className="text-xs font-mono mt-1" style={{ color: 'var(--text-dim)' }}>{sub}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

// ── Section title ─────────────────────────────────────────────────────────────

export function SectionTitle({ children }) {
  return (
    <div className="text-xs font-mono uppercase tracking-widest mb-3"
         style={{ color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
      {children}
    </div>
  )
}

// ── Stat block ────────────────────────────────────────────────────────────────

export function Stat({ label, value, mono = true }) {
  return (
    <div className="stat-row">
      <span className="text-xs" style={{ color: 'var(--text-sec)' }}>{label}</span>
      <span className={clsx('text-xs', mono && 'font-mono')} style={{ color: 'var(--text-pri)' }}>
        {value ?? '—'}
      </span>
    </div>
  )
}

// ── Number formatter ──────────────────────────────────────────────────────────

export function fmt(val, opts = {}) {
  if (val == null || isNaN(val)) return '—'
  const { style = 'decimal', compact = false, digits = 0 } = opts
  if (compact) {
    if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M`
    if (Math.abs(val) >= 1e3) return `${(val / 1e3).toFixed(1)}K`
  }
  return new Intl.NumberFormat('en-US', {
    style,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    ...(style === 'currency' ? { currency: 'USD' } : {}),
  }).format(val)
}
