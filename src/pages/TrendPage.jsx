import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getTrend } from '../api/client'
import { usePageFilters } from '../FilterContext'
import FilterBar from '../components/ui/FilterBar'
import PlotChart, { COLORS } from '../components/charts/PlotChart'
import { PageHeader, LoadingState, EmptyState } from '../components/ui/ui'

const METRICS = [
  { key: 'units_sold',   fcKey: 'forecast_units',   optKey: 'optimised_units',   label: 'Units'   },
  { key: 'revenue',      fcKey: 'forecast_revenue', optKey: 'optimised_revenue', label: 'Revenue' },
  { key: 'gross_profit', fcKey: 'forecast_profit',  optKey: 'optimised_profit',  label: 'Profit'  },
]

const MS_WEEK = 7 * 24 * 60 * 60 * 1000
const MS_YEAR = 52 * MS_WEEK

function fiscalYearStart(year) {
  const jan31 = new Date(year, 0, 31)
  const dow = jan31.getDay()
  const daysBack = dow === 6 ? 0 : dow + 1
  return new Date(year, 0, 31 - daysBack)
}

function retailWeek(dateStr) {
  const d = new Date(dateStr.substring(0, 10))
  d.setHours(0, 0, 0, 0)
  for (const yr of [d.getFullYear(), d.getFullYear() - 1]) {
    const fyStart = fiscalYearStart(yr)
    const diff = d - fyStart
    if (diff >= 0 && diff < 53 * MS_WEEK) return Math.floor(diff / MS_WEEK) + 1
  }
  return 1
}

function toTs(dateStr) {
  return new Date(dateStr.substring(0, 10)).getTime()
}

// Derive LY/TY windows dynamically from the data
// NY = all forecast rows
// TY = 52 weeks of actuals ending at last actual date
// LY = 52 weeks of actuals ending at start of TY
function deriveWindows(histRows, fcastRows) {
  if (!fcastRows.length && !histRows.length) return null

  // NY: forecast period
  const nyStart = fcastRows.length ? toTs(fcastRows[0].week_start_date) : null
  const nyEnd   = fcastRows.length ? toTs(fcastRows[fcastRows.length - 1].week_start_date) : null

  // TY: 52 weeks before NY start
  const tyEnd   = nyStart ? nyStart - MS_WEEK : (histRows.length ? toTs(histRows[histRows.length - 1].week_start_date) : null)
  const tyStart = tyEnd ? tyEnd - MS_YEAR + MS_WEEK : null

  // LY: 52 weeks before TY start
  const lyEnd   = tyStart ? tyStart - MS_WEEK : null
  const lyStart = lyEnd ? lyEnd - MS_YEAR + MS_WEEK : null

  return { lyStart, lyEnd, tyStart, tyEnd, nyStart, nyEnd }
}

export default function TrendPage() {
  const [filters, setFilters, clearFilters] = usePageFilters('trend')
  const [metric,        setMetric]        = useState(METRICS[0])
  const [showHoldout,   setShowHoldout]   = useState(true)
  const [showOptimised, setShowOptimised] = useState(true)
  const [activeView,    setActiveView]    = useState('recent')

  // Exclude sku_key — it's Demand Lab specific
  const baseParams = {
    ...(filters.dept_id      && { dept_id:      filters.dept_id      }),
    ...(filters.store_id     && { store_id:     filters.store_id     }),
    ...(filters.category_id  && { category_id:  filters.category_id  }),
    ...(filters.state_id     && { state_id:     filters.state_id     }),
    ...(filters.is_optimised != null && { is_optimised: filters.is_optimised }),
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['trend', baseParams],
    queryFn:  () => getTrend(baseParams),
    keepPreviousData: true,
  })

  const { historical, forecast, lastTrainingDate } = useMemo(() => {
    const rows = data?.data || []
    const allHist = rows.filter(r => r.period_type === 'historical')

    const trainingRows = allHist.filter(r => !r.is_holdout_overlap)
    const lastTraining = trainingRows.length
      ? trainingRows[trainingRows.length - 1].week_start_date.substring(0, 10)
      : null

    let hist = allHist
    if (!showHoldout) hist = hist.filter(r => !r.is_holdout_overlap)

    return {
      historical:       hist,
      forecast:         rows.filter(r => r.period_type === 'forecast'),
      lastTrainingDate: lastTraining,
    }
  }, [data, showHoldout])

  // Derive LY/TY/NY windows from actual data dates
  const windows = useMemo(() => deriveWindows(historical, forecast), [historical, forecast])

  // Filter rows for recent view using dynamic windows
  const recentHist = useMemo(() => {
    if (!windows?.lyStart) return historical
    return historical.filter(r => {
      const ts = toTs(r.week_start_date)
      return ts >= windows.lyStart
    })
  }, [historical, windows])

  const recentFcast = useMemo(() => forecast, [forecast])

  function buildTraces(histRows, fcastRows, windows) {
    const hover = lbl => `<b>%{x|%Y-%m-%d}</b> (Wk %{customdata})<br>${lbl}: %{y:,.0f}<extra></extra>`
    const traces = []

    if (histRows.length && windows) {
      const lyRows = histRows.filter(r => {
        const ts = toTs(r.week_start_date)
        return ts >= windows.lyStart && ts <= windows.lyEnd
      })
      // TY includes everything from tyStart onwards through holdout
      // (holdout weeks Jan 30 - Jun 11 2016 are part of TY+ actuals)
      const tyRows = histRows.filter(r => {
        const ts = toTs(r.week_start_date)
        return ts >= windows.tyStart
      })
      const olderRows = histRows.filter(r => {
        const ts = toTs(r.week_start_date)
        return windows.lyStart ? ts < windows.lyStart : false
      })

      if (olderRows.length) {
        traces.push({
          x: olderRows.map(r => r.week_start_date.substring(0, 10)),
          y: olderRows.map(r => r[metric.key]),
          customdata: olderRows.map(r => retailWeek(r.week_start_date)),
          name: 'Historical', type: 'scatter', mode: 'lines',
          line: { color: 'rgba(79,195,247,0.35)', width: 1 },
          hovertemplate: hover('Historical'),
        })
      }
      if (lyRows.length) {
        traces.push({
          x: lyRows.map(r => r.week_start_date.substring(0, 10)),
          y: lyRows.map(r => r[metric.key]),
          customdata: lyRows.map(r => retailWeek(r.week_start_date)),
          name: 'LY (Last Year)', type: 'scatter', mode: 'lines',
          line: { color: 'rgba(79,195,247,0.65)', width: 1.5 },
          hovertemplate: hover('LY'),
        })
      }
      if (tyRows.length) {
        traces.push({
          x: tyRows.map(r => r.week_start_date.substring(0, 10)),
          y: tyRows.map(r => r[metric.key]),
          customdata: tyRows.map(r => retailWeek(r.week_start_date)),
          name: 'TY (This Year)', type: 'scatter', mode: 'lines',
          line: { color: COLORS.sky, width: 2 },
          hovertemplate: hover('TY'),
        })
      }
    } else if (histRows.length) {
      traces.push({
        x: histRows.map(r => r.week_start_date.substring(0, 10)),
        y: histRows.map(r => r[metric.key]),
        customdata: histRows.map(r => retailWeek(r.week_start_date)),
        name: `Actual ${metric.label}`, type: 'scatter', mode: 'lines',
        line: { color: COLORS.sky, width: 1.5 },
        hovertemplate: hover('Actual'),
      })
    }

    if (fcastRows.length) {
      traces.push({
        x: fcastRows.map(r => r.week_start_date.substring(0, 10)),
        y: fcastRows.map(r => r[metric.fcKey]),
        customdata: fcastRows.map(r => retailWeek(r.week_start_date)),
        name: 'NY Forecast', type: 'scatter', mode: 'lines',
        line: { color: COLORS.signal, width: 1.5, dash: 'dot' },
        hovertemplate: hover('NY Forecast'),
      })
      if (showOptimised && fcastRows.some(r => r[metric.optKey] != null)) {
        traces.push({
          x: fcastRows.map(r => r.week_start_date.substring(0, 10)),
          y: fcastRows.map(r => r[metric.optKey]),
          customdata: fcastRows.map(r => retailWeek(r.week_start_date)),
          name: 'NY Optimised', type: 'scatter', mode: 'lines',
          line: { color: COLORS.warn, width: 1.5, dash: 'dot' },
          hovertemplate: hover('NY Optimised'),
        })
      }
    }
    return traces
  }

  // Forecast boundary = last TRAINING week (stable, never moves with holdout toggle)
  const forecastBoundary = lastTrainingDate

  const sharedLayout = (range) => ({
    xaxis: { type: 'date', tickformat: '%d %b %Y', ...(range && { range }) },
    yaxis: { title: metric.label, autorange: true },
    ...(forecastBoundary && {
      shapes: [{ type: 'line', x0: forecastBoundary, x1: forecastBoundary,
                 y0: 0, y1: 1, yref: 'paper',
                 line: { color: 'rgba(255,255,255,0.15)', width: 1, dash: 'dot' } }],
      annotations: [{ x: forecastBoundary, y: 0.96, yref: 'paper', text: 'Forecast →',
                      showarrow: false, font: { size: 9, color: '#505A6B', family: 'DM Mono' },
                      xanchor: 'left', xshift: 8 }],
    }),
  })

  const recentRange = useMemo(() => {
    if (!windows?.lyStart) return null
    return [
      new Date(windows.lyStart).toISOString().substring(0, 10),
      new Date(windows.nyEnd || windows.tyEnd).toISOString().substring(0, 10),
    ]
  }, [windows])

  const hasData = historical.length > 0 || forecast.length > 0

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Trend Analysis" sub="Weekly movement of sales, revenue and gross profit" />

      <div className="px-6 py-3 border-b flex flex-wrap items-end gap-4"
           style={{ borderColor: 'var(--border)' }}>
        <FilterBar filters={filters} onChange={setFilters} onClear={clearFilters} />

        <div>
          <label className="label">Metric</label>
          <div className="flex gap-1">
            {METRICS.map(m => (
              <button key={m.key} onClick={() => setMetric(m)}
                className={metric.key === m.key ? 'btn-primary btn' : 'btn-ghost btn'}
                style={{ padding: '5px 12px' }}>{m.label}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Holdout Actuals</label>
          <select className="select w-28" value={showHoldout ? 'show' : 'hide'}
                  onChange={e => setShowHoldout(e.target.value === 'show')}>
            <option value="show">Show</option>
            <option value="hide">Hide</option>
          </select>
        </div>

        <div>
          <label className="label">Optimised Line</label>
          <select className="select w-28" value={showOptimised ? 'show' : 'hide'}
                  onChange={e => setShowOptimised(e.target.value === 'show')}>
            <option value="show">Show</option>
            <option value="hide">Hide</option>
          </select>
        </div>
      </div>

      {/* Dynamic window labels */}
      {windows && (
        <div className="px-6 py-2 flex gap-6 border-b" style={{ borderColor: 'var(--border)' }}>
          {[
            { label: 'LY', start: windows.lyStart, end: windows.lyEnd, color: 'rgba(79,195,247,0.65)' },
            { label: 'TY', start: windows.tyStart, end: windows.tyEnd, color: 'var(--sky)' },
            { label: 'NY', start: windows.nyStart, end: windows.nyEnd, color: 'var(--signal)' },
          ].filter(w => w.start).map(w => (
            <div key={w.label} className="flex items-center gap-2">
              <div className="w-6 h-0.5 rounded" style={{ background: w.color }} />
              <span className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                <span style={{ color: w.color }}>{w.label}</span>
                {' '}{new Date(w.start).toLocaleDateString('en-US',{month:'short',year:'2-digit'})}
                {' – '}{new Date(w.end).toLocaleDateString('en-US',{month:'short',year:'2-digit'})}
              </span>
            </div>
          ))}
        </div>
      )}

      {isLoading && <LoadingState label="Loading…" />}
      {isError   && <EmptyState label="Failed to load" sub="Check the API is running" />}
      {!isLoading && !isError && !hasData && <EmptyState label="No data for selected filters" />}

      {!isLoading && hasData && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 pt-3 flex gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
            {[
              { key: 'recent', label: 'Recent — LY + TY + NY Forecast' },
              { key: 'full',   label: 'Full Data — All History + Forecast' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveView(tab.key)}
                className="px-4 py-2 text-xs font-mono rounded-t-lg transition-all"
                style={{
                  background:   activeView === tab.key ? 'var(--ink-50)' : 'transparent',
                  color:        activeView === tab.key ? 'var(--signal)' : 'var(--text-dim)',
                  borderBottom: activeView === tab.key ? '2px solid var(--signal)' : '2px solid transparent',
                }}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex-1 p-5">
            {activeView === 'recent' && (
              <PlotChart data={buildTraces(recentHist, recentFcast, windows)}
                         layout={sharedLayout(recentRange)}
                         config={{ scrollZoom: true, displayModeBar: true }} />
            )}
            {activeView === 'full' && (
              <PlotChart data={buildTraces(historical, forecast, windows)}
                         layout={sharedLayout(null)}
                         config={{ scrollZoom: true, displayModeBar: true }} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
