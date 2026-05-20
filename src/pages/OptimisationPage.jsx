import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  flexRender, createColumnHelper,
} from '@tanstack/react-table'
import { ArrowUp, ArrowDown, ArrowUpDown, X } from 'lucide-react'
import { usePageFilters } from '../FilterContext'
import { getJobs, getOptSummary, getOptFrontier, getOptResults, getConstraints } from '../api/optimisationClient'
import PlotChart, { COLORS } from '../components/charts/PlotChart'
import { PageHeader, Delta, LoadingState, EmptyState, SectionTitle, fmt } from '../components/ui/ui'

function rowsToCSV(rows) {
  if (!rows?.length) return ''
  const headers = Object.keys(rows[0])
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      const v = r[h]
      if (v == null) return ''
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s
    }).join(','))
  ].join('\n')
}

function triggerDownload(csv, filename) {
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'})
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href=url; a.download=filename; a.click()
  URL.revokeObjectURL(url)
}

const col = createColumnHelper()
const STATE_PREFIXES = { CA:'CA_', TX:'TX_', WI:'WI_' }
const ALL_STORES = ['CA_1','CA_2','CA_3','CA_4','TX_1','TX_2','TX_3','WI_1','WI_2','WI_3']
const ALL_DEPTS  = ['FOODS_1','FOODS_2','FOODS_3','HOBBIES_1','HOBBIES_2','HOUSEHOLD_1','HOUSEHOLD_2']

// ConstraintDiagram — rebuilt to show forbidden zones (colored = cannot price here)
// White gaps = valid pricing region per constraint
// Price points = vertical lines at top, sized differently, labels offset to avoid overlap

function ConstraintDiagram({ data, onClose }) {
  if (!data) return null

  if (!data.optimised) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center"
           style={{background:'rgba(0,0,0,0.7)'}} onClick={onClose}>
        <div className="card p-8 max-w-md text-center" onClick={e=>e.stopPropagation()}>
          <div className="text-lg font-mono mb-2" style={{color:'var(--text-sec)'}}>Not Optimised</div>
          <div className="text-sm font-mono" style={{color:'var(--text-dim)'}}>{data.message}</div>
          <button className="btn-ghost btn mt-4" onClick={onClose}>Close</button>
        </div>
      </div>
    )
  }

  const COLOR_MAP = {
    warn  : '#FF6B35',
    sky   : '#4FC3F7',
    signal: '#00E5A0',
    gold  : '#FFD700',
    purple: '#B39DDB',
    teal  : '#4DB6AC',
  }

  const constraints = (data.constraints || []).filter(c => c.name !== 'effective_bounds')
  const effectiveBounds = data.constraints?.find(c => c.name === 'effective_bounds')

  const p_con   = data.constrained_price        // green star — final recommended
  const p_raw   = data.constrained_price_raw    // blue square — solver output
  const p_curr  = data.current_price            // orange diamond — current
  const p_uncon = data.unconstrained_price      // NOT plotted — shown as text

  // Axis range: based only on constrained-relevant prices, ignore unconstrained outlier
  const relevantPrices = [
    data.unit_cost,
    effectiveBounds?.lower,
    effectiveBounds?.upper,
    p_con, p_raw, p_curr,
    ...constraints.flatMap(c => [c.lower, c.upper].filter(v => v != null)),
  ].filter(v => v != null && !isNaN(v))

  const padding = (Math.max(...relevantPrices) - Math.min(...relevantPrices)) * 0.15
  const xMin = Math.max(0, Math.min(...relevantPrices) - padding)
  const xMax = Math.max(...relevantPrices) + padding

  const traces = []
  const yLabels = []

  // ── Constraint rows — forbidden zone bars ──────────────────────────────────
  // For each constraint, color the FORBIDDEN zones (outside bounds)
  // White gap = valid region

  constraints.forEach((c, i) => {
    yLabels.push(c.label)
    const color = COLOR_MAP[c.color] || '#4FC3F7'
    const opacity = (c.active && !c.relaxed) ? 0.85 : 0.25
    const hoverBase = `${c.label}${c.relaxed ? ' (relaxed)' : ''}`

    if (c.lower != null && c.upper != null) {
      // Forbidden LEFT zone: xMin → lower
      if (c.lower > xMin) {
        traces.push({
          x: [xMin, c.lower], y: [i, i], mode: 'lines',
          line: { color, width: 28 }, opacity,
          hovertemplate: `${hoverBase}<br>Forbidden: < $${c.lower.toFixed(2)}<extra></extra>`,
          showlegend: false,
        })
      }
      // Forbidden RIGHT zone: upper → xMax
      if (c.upper < xMax) {
        traces.push({
          x: [c.upper, xMax], y: [i, i], mode: 'lines',
          line: { color, width: 28 }, opacity,
          hovertemplate: `${hoverBase}<br>Forbidden: > $${c.upper.toFixed(2)}<extra></extra>`,
          showlegend: false,
        })
      }
      // Boundary ticks — solid white at row level only
      traces.push({
        x: [c.lower, c.lower], y: [i - 0.45, i + 0.45], mode: 'lines',
        line: { color: '#fff', width: 2.5 }, opacity: 0.95,
        showlegend: false, hoverinfo: 'skip',
      })
      traces.push({
        x: [c.upper, c.upper], y: [i - 0.45, i + 0.45], mode: 'lines',
        line: { color: '#fff', width: 2.5 }, opacity: 0.95,
        showlegend: false, hoverinfo: 'skip',
      })
      // Bound value labels — placed inside forbidden zone, tight against the tick line
      // Lower: label sits just to the LEFT of the lower tick (inside left forbidden zone)
      traces.push({
        x: [c.lower], y: [i], mode: 'text',
        text: [`$${c.lower.toFixed(2)}`],
        textposition: 'middle left',
        textfont: { size: 10, color: '#fff' },
        showlegend: false, hoverinfo: 'skip',
      })
      // Upper: label sits just to the RIGHT of the upper tick (inside right forbidden zone)
      traces.push({
        x: [c.upper], y: [i], mode: 'text',
        text: [`$${c.upper.toFixed(2)}`],
        textposition: 'middle right',
        textfont: { size: 10, color: '#fff' },
        showlegend: false, hoverinfo: 'skip',
      })

    } else if (c.lower != null) {
      // Cost floor or margin floor — forbidden zone is xMin → lower
      if (c.lower > xMin) {
        traces.push({
          x: [xMin, c.lower], y: [i, i], mode: 'lines',
          line: { color, width: 28 }, opacity,
          hovertemplate: `${hoverBase}<br>Forbidden: < $${c.lower.toFixed(2)}<extra></extra>`,
          showlegend: false,
        })
      }
      // Single boundary tick — solid at row level
      traces.push({
        x: [c.lower, c.lower], y: [i - 0.45, i + 0.45], mode: 'lines',
        line: { color: '#fff', width: 2.5 }, opacity: 0.95,
        showlegend: false, hoverinfo: 'skip',
      })
      // Single bound label: inside the forbidden zone (left of boundary)
      traces.push({
        x: [c.lower], y: [i], mode: 'text',
        text: [`$${c.lower.toFixed(2)}`],
        textposition: 'middle left',
        textfont: { size: 10, color: '#fff' },
        showlegend: false, hoverinfo: 'skip',
      })
    }
  })

  // ── Effective feasible region row ──────────────────────────────────────────
  if (effectiveBounds?.lower != null) {
    const i = constraints.length
    yLabels.push('Feasible Region')
    const eb_lo = effectiveBounds.lower
    const eb_hi = effectiveBounds.upper

    // Forbidden LEFT
    if (eb_lo > xMin) {
      traces.push({
        x: [xMin, eb_lo], y: [i, i], mode: 'lines',
        line: { color: '#00E5A0', width: 28 }, opacity: 0.5,
        hovertemplate: `Feasible lower: $${eb_lo.toFixed(2)}<extra></extra>`,
        showlegend: false,
      })
    }
    // Forbidden RIGHT
    if (eb_hi < xMax) {
      traces.push({
        x: [eb_hi, xMax], y: [i, i], mode: 'lines',
        line: { color: '#00E5A0', width: 28 }, opacity: 0.5,
        hovertemplate: `Feasible upper: $${eb_hi.toFixed(2)}<extra></extra>`,
        showlegend: false,
      })
    }
    // Boundary ticks
    ;[eb_lo, eb_hi].filter(v=>v!=null).forEach((v, idx) => {
      // Dotted line from price point row (0) down through all constraints to this row
      // This visually connects the feasible bounds to where the price points sit
      traces.push({
        x: [v, v], y: [0.5, i + 0.45], mode: 'lines',
        line: { color: 'rgba(0,229,160,0.3)', width: 1.5, dash: 'dot' }, opacity: 1,
        showlegend: false, hoverinfo: 'skip',
      })
      // Solid tick at feasible region row
      traces.push({
        x: [v, v], y: [i - 0.45, i + 0.45], mode: 'lines',
        line: { color: '#00E5A0', width: 3 }, opacity: 1,
        showlegend: false, hoverinfo: 'skip',
      })
      // Bound label inside forbidden zone
      traces.push({
        x: [v], y: [i], mode: 'text',
        text: [`$${v.toFixed(2)}`],
        textposition: idx === 0 ? 'middle left' : 'middle right',
        textfont: { size: 10, color: '#00E5A0' },
        showlegend: false, hoverinfo: 'skip',
      })
    })
  }

  // ── Price points row — at TOP, vertical lines with staggered labels ────────
  // Price points go at TOP (row -1) — before all constraints
  // Insert at beginning of yLabels
  const pricePointRow = -1
  yLabels.unshift('Price Points')
  // Adjust all existing trace y-values by +1 since we prepended a row
  traces.forEach(t => {
    if (Array.isArray(t.y)) t.y = t.y.map(v => typeof v === 'number' ? v + 1 : v)
  })
  // Update effectiveBounds row index
  const ebRowIdx = yLabels.indexOf('Feasible Region')

  const pricePoints = [
    { x: p_curr, name: 'Current',        color: '#FF6B35', sym: 'diamond',      sz: 16 },
    { x: p_raw,  name: 'Solver Output',  color: '#4FC3F7', sym: 'square',       sz: 12 },
    { x: p_con,  name: 'Final (Snapped)',color: '#00E5A0', sym: 'star',         sz: 20 },
  ].filter(p => p.x != null)

  // Sort by price to assign label positions alternating above/below
  const sorted = [...pricePoints].sort((a, b) => a.x - b.x)
  sorted.forEach((p, i) => {
    const labelPos = i % 2 === 0 ? 'top center' : 'bottom center'
    traces.push({
      x: [p.x], y: [0],
      mode: 'markers+text',
      marker: { color: p.color, symbol: p.sym, size: p.sz, line: { color: '#fff', width: 1 } },
      text: [`$${p.x.toFixed(2)}`],
      textposition: labelPos,
      textfont: { size: 11, color: p.color },
      name: p.name,
      hovertemplate: `${p.name}: $${p.x.toFixed(2)}<extra></extra>`,
      showlegend: true,
    })
  })

  const nRows = yLabels.length
  const chartHeight = Math.max(320, nRows * 70 + 80)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{background:'rgba(0,0,0,0.75)'}} onClick={onClose}>
      <div className="card p-6" style={{width:820, maxHeight:'90vh', overflow:'auto'}}
           onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="font-mono text-base font-semibold" style={{color:'var(--text-pri)'}}>
              {data.sku_id} / {data.store_id}
            </div>
            <div className="text-xs font-mono mt-0.5" style={{color:'var(--text-dim)'}}>
              α={data.alpha} · {data.scenario_id}
              {data.price_snap_applied && ` · Snapped: ${data.price_snap_note}`}
            </div>
          </div>
          <button className="btn-ghost btn p-2 flex-shrink-0" onClick={onClose}><X size={16}/></button>
        </div>

        {/* Constraint status chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          {(data.constraints_active||[]).map(c=>(
            <span key={c} className="badge" style={{background:'rgba(0,229,160,0.12)',color:'var(--signal)',fontSize:'11px'}}>✓ {c}</span>
          ))}
          {(data.constraints_relaxed||[]).map(c=>(
            <span key={c} className="badge" style={{background:'rgba(255,107,53,0.12)',color:'var(--warn)',fontSize:'11px'}}>⚠ relaxed: {c}</span>
          ))}
        </div>

        {/* Unconstrained price — shown as text, NOT on chart (would distort scale) */}
        {p_uncon != null && (
          <div className="mb-3 px-3 py-1.5 rounded text-xs font-mono"
               style={{background:'rgba(255,255,255,0.04)', color:'var(--text-dim)'}}>
            Unconstrained optimal price: <span style={{color:'var(--text-sec)'}}>${p_uncon.toFixed(2)}</span>
            <span className="ml-2">(excluded from chart — outside constrained range)</span>
          </div>
        )}

        {/* Chart */}
        <div style={{height: chartHeight}}>
          <PlotChart data={traces}
            layout={{
              xaxis: {
                title: { text: 'Price ($)', font: { size: 11 } },
                range: [xMin, xMax],
                tickformat: '$,.2f',
                gridcolor: 'rgba(255,255,255,0.06)',
              },
              yaxis: {
                tickvals: yLabels.map((_, i) => i),
                ticktext: yLabels,
                autorange: 'reversed',
                gridcolor: 'rgba(255,255,255,0.06)',
              },
              margin: { t: 10, r: 20, b: 55, l: 170 },
              hovermode: 'closest',
              legend: {
                orientation: 'h', x: 0.5, xanchor: 'center',
                y: -0.15, font: { size: 11 },
              },
              plot_bgcolor:  'transparent',
              paper_bgcolor: 'transparent',
            }}
            config={{ displayModeBar: false }}
          />
        </div>

        {/* Reading guide */}
        <div className="mt-2 text-xs font-mono" style={{color:'var(--text-dim)'}}>
          Colored bars = forbidden pricing zones · White gaps = valid range · Faded = constraint relaxed
        </div>
      </div>
    </div>
  )
}


// ── Table columns ─────────────────────────────────────────────────────────────
const TABLE_COLS = [
  col.accessor('store_id',                {header:'Store',       size:70}),
  col.accessor('department_id',           {header:'Dept',        size:90}),
  col.accessor('sku_id',                  {header:'SKU',         size:140}),
  col.accessor('is_optimised_in_scenario',{header:'Optimised',   size:75,
    cell:i=>Boolean(i.getValue())
      ?<span className="text-xs font-mono" style={{color:'var(--signal)'}}>Yes</span>
      :<span className="text-xs font-mono" style={{color:'var(--text-dim)'}}>No</span>}),
  col.accessor('current_price',{header:'Current $',size:82,
    cell:i=><span className="font-mono">${i.getValue()?.toFixed(2)??'—'}</span>}),
  col.accessor('opt_price',{header:'Opt $',size:82,
    cell:i=>{const v=i.getValue();return v!=null?<span className="font-mono" style={{color:'var(--signal)'}}>${Number(v).toFixed(2)}</span>:<span style={{color:'var(--text-dim)'}}>—</span>}}),
  col.accessor('p3_comp_a_price',{header:'Comp A $',size:82,
    cell:i=>{const v=i.getValue();return v!=null?<span className="font-mono" style={{color:'var(--sky)'}}>${Number(v).toFixed(2)}</span>:<span style={{color:'var(--text-dim)'}}>—</span>}}),
  col.accessor('p4_comp_b_price',{header:'Comp B $',size:82,
    cell:i=>{const v=i.getValue();return v!=null?<span className="font-mono" style={{color:'var(--sky)'}}>${Number(v).toFixed(2)}</span>:<span style={{color:'var(--text-dim)'}}>—</span>}}),
  col.accessor('ny_vs_ty_revenue_pct', {header:'NY Fcst/TY Rev%',  size:100,cell:i=><Delta value={i.getValue()}/>}),
  col.accessor('ny_vs_ty_profit_pct',  {header:'NY Fcst/TY Pft%',  size:100,cell:i=><Delta value={i.getValue()}/>}),
  col.accessor('ny_vs_ty_units_pct',   {header:'NY Fcst/TY Units%',size:100,cell:i=><Delta value={i.getValue()}/>}),
  col.accessor('ny_vs_opt_revenue_pct',{header:'NY Opt/Fcst Rev%', size:100,cell:i=><Delta value={i.getValue()}/>}),
  col.accessor('ny_vs_opt_profit_pct', {header:'NY Opt/Fcst Pft%', size:100,cell:i=><Delta value={i.getValue()}/>}),
  col.accessor('ny_vs_opt_units_pct',  {header:'NY Opt/Fcst Units%',size:100,cell:i=><Delta value={i.getValue()}/>}),
  col.accessor('constraints_active',{header:'Constraints',size:160,
    cell:i=><span className="font-mono" style={{color:'var(--text-dim)',fontSize:'11px'}}>{i.getValue()||'—'}</span>}),
]

// ── Compact metric row ────────────────────────────────────────────────────────
function MetricRow({ label, ty, nyFc, nyOpt, fcPct, optVsFcPct }) {
  // fcPct   = NY Forecast vs TY
  // optVsFcPct = NY Optimised vs NY Forecast (true opt uplift)
  return (
    <div className="py-2.5 border-b" style={{borderColor:'rgba(255,255,255,0.06)'}}>
      <div className="font-mono uppercase mb-2" style={{color:'var(--text-sec)',fontSize:'12px',fontWeight:600,letterSpacing:'0.06em'}}>{label}</div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="font-mono mb-0.5" style={{color:'var(--text-sec)',fontSize:'12px',fontWeight:500}}>TY Actuals</div>
          <div className="font-mono font-semibold" style={{color:'var(--text-pri)',fontSize:'15px'}}>{fmt(ty,{compact:true})}</div>
        </div>
        <div>
          <div className="font-mono mb-0.5" style={{color:'var(--text-sec)',fontSize:'12px',fontWeight:500}}>NY Forecast</div>
          <div className="font-mono font-semibold" style={{color:'var(--sky)',fontSize:'15px'}}>{fmt(nyFc,{compact:true})}</div>
          {fcPct!=null&&<div className={"font-mono " + (fcPct>=0?'delta-pos':'delta-neg')} style={{fontSize:'11px'}}>{fcPct>=0?'▲':'▼'} {Math.abs(fcPct).toFixed(1)}% vs TY</div>}
        </div>
        <div>
          <div className="font-mono mb-0.5" style={{color:'var(--text-sec)',fontSize:'12px',fontWeight:500}}>NY Optimised</div>
          <div className="font-mono font-semibold" style={{color:'var(--signal)',fontSize:'15px'}}>{fmt(nyOpt,{compact:true})}</div>
          {optVsFcPct!=null&&<div className={"font-mono " + (optVsFcPct>=0?'delta-pos':'delta-neg')} style={{fontSize:'11px'}}>{optVsFcPct>=0?'▲':'▼'} {Math.abs(optVsFcPct).toFixed(1)}% vs Fcst</div>}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OptimisationPage() {
  const [filters, setFilters, clearFilters] = usePageFilters('optimisation')
  const [selectedJob,       setSelectedJob]       = useState('job_001')
  const [selectedScenarios, setSelectedScenarios] = useState(['baseline'])
  const [alpha,             setAlpha]             = useState(0.5)
  const [tableScenario,     setTableScenario]     = useState('baseline')
  const [optimisedOnly,     setOptimisedOnly]     = useState(false)
  const [page,              setPage]              = useState(1)
  const [sorting,           setSorting]           = useState([{id:'store_id',desc:false}])
  const [modalData,         setModalData]         = useState(null)
  const [pageSize, setPageSize] = useState(50)
  const [downloading, setDownloading] = useState(false)

  const dept_id  = filters.opt_dept  || null
  const store_id = filters.opt_store || null
  const state_id = filters.opt_state || null

  const filteredStores = state_id ? ALL_STORES.filter(s=>s.startsWith(STATE_PREFIXES[state_id]||'')) : ALL_STORES

  const setFilter = (key,val) => {
    const updated = {...filters,[key]:val||null}
    if (key==='opt_state') {
      const p = val ? STATE_PREFIXES[val] : null
      if (p && filters.opt_store && !filters.opt_store.startsWith(p)) updated.opt_store = null
    }
    setFilters(updated); setPage(1)
  }

  const fp = { job_id:selectedJob, ...(dept_id&&{dept_id}), ...(store_id&&{store_id}), ...(state_id&&{state_id}) }

  const { data: jobsData } = useQuery({queryKey:['jobs'],queryFn:getJobs})
  const jobs = jobsData?.data||[]
  const currentJob = jobs.find(j=>j.job_id===selectedJob)
  const availableScenarios = currentJob?.scenarios||[]

  const toggleScenario = sid => setSelectedScenarios(prev=>
    prev.includes(sid) ? (prev.length>1?prev.filter(s=>s!==sid):prev) : prev.length>=3?prev:[...prev,sid])

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['opt-summary',fp,selectedScenarios,alpha,optimisedOnly],
    queryFn:  ()=>getOptSummary({...fp,scenario_ids:selectedScenarios,alpha,optimised_only:optimisedOnly}),
    enabled: selectedScenarios.length>0,
  })
  const summaries = summaryData?.data||[]



  const sortCol  = sorting[0]?.id||'store_id'
  const sortDesc = sorting[0]?.desc??false

  const { data: resultsData, isLoading: resultsLoading } = useQuery({
    queryKey: ['opt-results',fp,tableScenario,alpha,page,pageSize,sortCol,sortDesc,optimisedOnly],
    queryFn:  ()=>getOptResults({...fp,scenario_id:tableScenario,alpha,page,page_size:pageSize,sort_by:sortCol,sort_desc:sortDesc,optimised_only:optimisedOnly}),
    keepPreviousData:true, enabled:!!tableScenario,
  })

  const rows       = resultsData?.data||[]
  const totalPages = resultsData?.meta?.total_pages||1
  const totalRows  = resultsData?.meta?.total_rows||0
  const optCount   = resultsData?.meta?.optimised_count||0

  const table = useReactTable({
    data:rows,columns:TABLE_COLS,state:{sorting},onSortingChange:setSorting,
    getCoreRowModel:getCoreRowModel(),getSortedRowModel:getSortedRowModel(),
    manualSorting:true,manualPagination:true,
  })

  const loadConstraints = async row => {
    try { const d = await getConstraints(row.sku_id,row.store_id,{job_id:selectedJob,scenario_id:tableScenario,alpha}); setModalData(d) }
    catch(e){console.error(e)}
  }

  // Frontier removed — too cluttered for small optimised-SKU dataset

  return (
    <div className="flex flex-col" style={{height:'100vh',overflow:'hidden'}}>
      <PageHeader title="Optimisation Studio" sub="Scenario comparison, efficient frontier and constraint analysis" />

      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b flex-shrink-0" style={{borderColor:'var(--border)'}}>
        <div className="flex flex-wrap gap-4 items-end mb-3">
          <div>
            <label className="label">Job</label>
            <select className="select w-64" value={selectedJob}
                    onChange={e=>{setSelectedJob(e.target.value);setSelectedScenarios([])}}>
              {jobs.map(j=><option key={j.job_id} value={j.job_id}>{j.label}</option>)}
              {!jobs.length&&<option value="job_001">M5 Baseline Optimisation Run</option>}
            </select>
          </div>
          <div>
            <label className="label">Alpha — α={alpha.toFixed(1)}</label>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono" style={{color:'var(--text-dim)'}}>Revenue</span>
              <input type="range" min="0.1" max="1.0" step="0.1" value={alpha}
                     onChange={e=>setAlpha(parseFloat(e.target.value))}
                     style={{width:'120px',accentColor:'var(--signal)'}}/>
              <span className="text-xs font-mono" style={{color:'var(--text-dim)'}}>Profit</span>
            </div>
          </div>
          <div>
            <label className="label">SKUs</label>
            <select className="select w-32" value={optimisedOnly?'opt':'all'}
                    onChange={e=>{setOptimisedOnly(e.target.value==='opt');setPage(1)}}>
              <option value="all">All SKUs</option>
              <option value="opt">Optimised Only</option>
            </select>
          </div>
          <div>
            <label className="label">Select max 3 scenarios</label>
            <div className="flex gap-2">
              {(availableScenarios.length?availableScenarios:[{scenario_id:'baseline',label:'Baseline'},{scenario_id:'quantity_drop_restriction',label:'Qty Drop Restricted'}]).map(s=>{
                const active=selectedScenarios.includes(s.scenario_id)
                return <button key={s.scenario_id} onClick={()=>toggleScenario(s.scenario_id)}
                  className="btn px-3 py-1.5 text-xs font-mono rounded-lg"
                  style={{background:active?'var(--signal)':'var(--ink-100)',color:active?'var(--ink)':'var(--text-sec)',border:`1px solid ${active?'var(--signal)':'var(--border)'}`}}>
                  {s.label}
                </button>
              })}
            </div>
          </div>
        </div>
        <div className="flex gap-3 items-end">
          <div>
            <label className="label">Region</label>
            <select className="select w-20" value={state_id||''} onChange={e=>setFilter('opt_state',e.target.value)}>
              <option value="">All</option>{['CA','TX','WI'].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Store</label>
            <select className="select w-24" value={store_id||''} onChange={e=>setFilter('opt_store',e.target.value)}>
              <option value="">All</option>{filteredStores.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Department</label>
            <select className="select w-40" value={dept_id||''} onChange={e=>setFilter('opt_dept',e.target.value)}>
              <option value="">All</option>{ALL_DEPTS.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {(state_id||store_id||dept_id) && (
            <div>
              <label className="label">&nbsp;</label>
              <button className="btn-ghost btn" style={{padding:'5px 12px',fontSize:'12px',color:'var(--warn)',borderColor:'rgba(255,107,53,0.3)'}}
                      onClick={()=>{clearFilters();setPage(1)}}>
                ✕ Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Scrollable content ───────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* KPI cards — dynamic columns per scenario, compact */}
        {!summaryLoading && summaries.length > 0 && (
          <div className="px-6 py-3 border-b" style={{borderColor:'var(--border)'}}>
            <div className="text-xs font-mono uppercase tracking-widest mb-2" style={{color:'var(--text-dim)'}}>
              Summary α={alpha.toFixed(1)} · {optimisedOnly?'Optimised Only':'All SKUs'}
            </div>
            <div className="grid gap-3" style={{gridTemplateColumns:`repeat(${summaries.length},1fr)`}}>
              {summaries.map(s=>(
                <div key={s.scenario_id} className="card px-4 py-3"
                     style={{borderTopColor:'var(--signal)',borderTopWidth:2}}>
                  <div className="font-mono text-sm font-medium mb-0.5" style={{color:'var(--signal)'}}>{s.scenario_label}</div>
                  <div className="text-xs font-mono mb-3" style={{color:'var(--text-dim)'}}>{s.optimised_count?.toLocaleString()} optimised / {s.sku_count?.toLocaleString()} SKUs</div>
                  <MetricRow label="Units"   ty={s.ty?.units}   nyFc={s.ny_forecast?.units}   nyOpt={s.ny_optimised?.units}   fcPct={s.lift_fc?.units_pct}   optVsFcPct={s.lift_opt_vs_fc?.units_pct}/>
                  <MetricRow label="Revenue" ty={s.ty?.revenue} nyFc={s.ny_forecast?.revenue} nyOpt={s.ny_optimised?.revenue} fcPct={s.lift_fc?.revenue_pct} optVsFcPct={s.lift_opt_vs_fc?.revenue_pct}/>
                  <MetricRow label="Profit"  ty={s.ty?.profit}  nyFc={s.ny_forecast?.profit}  nyOpt={s.ny_optimised?.profit}  fcPct={s.lift_fc?.profit_pct}  optVsFcPct={s.lift_opt_vs_fc?.profit_pct}/>
                  {(s.cpi||[]).length > 0 && (
                    <div className="pt-2 mt-1 border-t" style={{borderColor:'rgba(255,255,255,0.06)'}}>
                      <div className="font-mono uppercase mb-2" style={{color:'var(--text-dim)',fontSize:'10px',letterSpacing:'0.08em'}}>
                        Competitive Pricing Index
                      </div>
                      {(s.cpi||[]).map(c => {
                        const label = c.competitor === 'competitor_a' ? 'Comp A' : 'Comp B'
                        const withinColor = c.within_target === true ? 'var(--signal)' : c.within_target === false ? 'var(--warn)' : 'var(--text-sec)'
                        return (
                          <div key={c.competitor} className="mb-2.5">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono text-xs font-medium" style={{color:'var(--text-sec)'}}>{label}</span>
                              <span className="font-mono" style={{color:'var(--text-dim)',fontSize:'10px'}}>
                                {c.n_skus_with_comp?.toLocaleString()} / {c.n_total?.toLocaleString()} SKUs ({c.coverage_pct}% coverage)
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <div className="font-mono" style={{color:'var(--text-sec)',fontSize:'12px',fontWeight:500}}>Current</div>
                                <div className="font-mono font-semibold" style={{color:'var(--text-pri)',fontSize:'14px'}}>{c.current_cpi?.toFixed(3)}</div>
                              </div>
                              <div>
                                <div className="font-mono" style={{color:'var(--text-sec)',fontSize:'12px',fontWeight:500}}>Optimised</div>
                                <div className="font-mono font-semibold" style={{color:withinColor,fontSize:'14px'}}>{c.optimised_cpi?.toFixed(3)}</div>
                                {c.within_target!=null && (
                                  <div className="font-mono" style={{color:withinColor,fontSize:'10px'}}>
                                    {c.within_target ? '✓ within target' : '✗ outside target'}
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="font-mono" style={{color:'var(--text-sec)',fontSize:'12px',fontWeight:500}}>Target Range</div>
                                <div className="font-mono font-semibold" style={{color:'var(--text-sec)',fontSize:'14px'}}>
                                  {c.target_lower?.toFixed(2)} – {c.target_upper?.toFixed(2)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}



        {/* SKU table */}
        <div className="px-6 pt-3 pb-1 flex items-center gap-3" style={{borderColor:'var(--border)'}}>
          <span className="text-xs font-mono uppercase tracking-widest" style={{color:'var(--text-dim)'}}>SKU Results</span>
          <div className="flex gap-2 ml-2">
            {(availableScenarios.length?availableScenarios:[{scenario_id:'baseline',label:'Baseline'},{scenario_id:'quantity_drop_restriction',label:'Qty Drop Restricted'}]).map(s=>(
              <button key={s.scenario_id} onClick={()=>{setTableScenario(s.scenario_id);setPage(1)}}
                      className="btn px-3 py-1 text-xs font-mono rounded-lg"
                      style={{background:tableScenario===s.scenario_id?'var(--signal)':'var(--ink-100)',color:tableScenario===s.scenario_id?'var(--ink)':'var(--text-sec)',border:`1px solid ${tableScenario===s.scenario_id?'var(--signal)':'var(--border)'}`}}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs font-mono" style={{color:'var(--text-dim)'}}>
              α={alpha.toFixed(1)} · {fmt(totalRows)} SKUs ({fmt(optCount)} optimised) · click row for constraints
            </span>
            <span className="text-xs font-mono" style={{color:'var(--text-dim)'}}>Rows:</span>
            <select className="select" style={{width:'80px',padding:'3px 8px'}}
                    value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1)}}>
              {[50,100,200,300].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
            <button className="btn-ghost btn" style={{padding:'3px 10px',fontSize:'12px',opacity:downloading?0.5:1}}
                    disabled={downloading}
                    onClick={async ()=>{
                      setDownloading(true)
                      try {
                        const res = await getOptResults({...fp,scenario_id:tableScenario,alpha,page:1,page_size:50000,sort_by:sortCol,sort_desc:sortDesc,optimised_only:optimisedOnly})
                        const allRows = Array.isArray(res) ? res : (res.data || [])
                        triggerDownload(rowsToCSV(allRows), `optimisation_${tableScenario}_alpha${alpha.toFixed(1)}.csv`)
                      } catch(e) { console.error('Download failed:', e) }
                      finally { setDownloading(false) }
                    }}>
              {downloading ? '…' : '↓ CSV'}
            </button>
          </div>
        </div>

        {resultsLoading&&!rows.length?<LoadingState label="Loading…"/>
          :!rows.length?<EmptyState label="No results"/>
          :<>
            <div style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - 520px)'}}>
              <table className="data-table" style={{tableLayout:'fixed',borderCollapse:'separate',borderSpacing:0}}>
                <thead>
                  {table.getHeaderGroups().map(hg=>(
                    <tr key={hg.id}>
                      {hg.headers.map(h=>(
                        <th key={h.id}
                            style={{width:h.column.columnDef.size,position:'sticky',top:0,zIndex:2,background:'var(--ink-50)'}}
                            onClick={h.column.getToggleSortingHandler()}
                            className={h.column.getCanSort()?'cursor-pointer select-none':''}>
                          <div className="flex items-center gap-1">
                            {flexRender(h.column.columnDef.header,h.getContext())}
                            {h.column.getIsSorted()==='desc'&&<ArrowDown size={10}/>}
                            {h.column.getIsSorted()==='asc' &&<ArrowUp   size={10}/>}
                            {h.column.getCanSort()&&!h.column.getIsSorted()&&<ArrowUpDown size={10} className="opacity-30"/>}
                          </div>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map(row=>(
                    <tr key={row.id} className="cursor-pointer"
                        onClick={()=>loadConstraints(row.original)}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(0,229,160,0.04)'}
                        onMouseLeave={e=>e.currentTarget.style.background=''}>
                      {row.getVisibleCells().map(cell=>(
                        <td key={cell.id}>{flexRender(cell.column.columnDef.cell,cell.getContext())}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-t"
                 style={{borderColor:'var(--border)'}}>
              <span className="text-xs font-mono" style={{color:'var(--text-dim)'}}>
                Page {page} of {totalPages} · Sorted: Store → Dept → SKU
              </span>
              <div className="flex gap-2">
                <button className="btn-ghost btn" style={{padding:'3px 10px'}} disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Prev</button>
                <button className="btn-ghost btn" style={{padding:'3px 10px'}} disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>Next →</button>
              </div>
            </div>
          </>
        }
      </div>

      {modalData&&<ConstraintDiagram data={modalData} onClose={()=>setModalData(null)}/>}
    </div>
  )
}
