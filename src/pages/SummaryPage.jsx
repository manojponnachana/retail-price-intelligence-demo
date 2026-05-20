import React, { useState, useMemo } from 'react'
import { usePageFilters } from '../FilterContext'
import { useQuery } from '@tanstack/react-query'
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  flexRender, createColumnHelper,
} from '@tanstack/react-table'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { getKpiCards, getTyLyNy } from '../api/client'
import FilterBar from '../components/ui/FilterBar'
import { PageHeader, Delta, TierBadge, LoadingState, EmptyState, fmt } from '../components/ui/ui'

function rowsToCSV(rows, excludeKeys=[]) {
  if (!rows?.length) return ''
  // Flatten one level of nested objects, exclude specified keys
  const flatRow = r => {
    const out = {}
    for (const [k, v] of Object.entries(r)) {
      if (excludeKeys.includes(k)) continue
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        for (const [k2, v2] of Object.entries(v)) out[`${k}_${k2}`] = v2
      } else { out[k] = v }
    }
    return out
  }
  const flat = rows.map(flatRow)
  const headers = Object.keys(flat[0])
  return [
    headers.join(','),
    ...flat.map(r => headers.map(h => {
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

function buildCols(metric) {
  const M = {
    revenue: { ly:'last_year_revenue',  ty:'this_year_revenue',  nyFc:'next_year_forecast_revenue', nyOpt:'next_year_optimised_revenue',  tyLy:'ty_vs_ly_revenue_pct', nyTy:'ny_vs_ty_forecast_revenue_pct', lift:'ny_lift_revenue_pct', isCurrency:true  },
    units:   { ly:'last_year_units',    ty:'this_year_units',    nyFc:'next_year_forecast_units',   nyOpt:'next_year_optimised_units',    tyLy:'ty_vs_ly_units_pct',   nyTy:'ny_vs_ty_forecast_units_pct',   lift:'ny_lift_units_pct',   isCurrency:false },
    profit:  { ly:'last_year_profit',   ty:'this_year_profit',   nyFc:'next_year_forecast_profit',  nyOpt:'next_year_optimised_profit',   tyLy:'ty_vs_ly_profit_pct',  nyTy:'ny_vs_ty_forecast_profit_pct',  lift:'ny_lift_profit_pct',  isCurrency:true  },
  }
  const c = M[metric]
  const fv = v => v == null ? '—' : (c.isCurrency ? `$${fmt(v,{compact:true})}` : fmt(v,{compact:true}))
  const fp = v => v == null ? '—' : `$${Number(v).toFixed(2)}`
  return [
    col.accessor('sku_id',            { header: 'SKU',    size: 140 }),
    col.accessor('store_id',          { header: 'Store',  size: 70  }),
    col.accessor('department_name',   { header: 'Dept',   size: 145 }),
    col.accessor('sku_tier',          { header: 'Tier',   size: 70, cell: i => <TierBadge tier={i.getValue()} /> }),
    col.accessor('elasticity_coefficient', { header: 'Elasticity', size: 90,
      cell: i => <span className="font-mono" style={{color:'var(--sky)'}}>{i.getValue()?.toFixed(2) ?? '—'}</span> }),
    col.accessor('current_price',     { header: 'Current $', size: 90,
      cell: i => <span className="font-mono">{fp(i.getValue())}</span> }),
    col.accessor('recommended_price', { header: 'Opt $',   size: 90,
      cell: i => {
        const v = i.getValue()
        return v != null
          ? <span className="font-mono" style={{color:'var(--signal)'}}>${Number(v).toFixed(2)}</span>
          : <span style={{color:'var(--text-dim)'}}>—</span>
      }}),
    col.accessor('is_optimised', { header: 'Optimised', size: 85,
      cell: i => i.getValue()
        ? <span className="font-mono text-xs" style={{color:'var(--signal)'}}>Yes</span>
        : <span className="font-mono text-xs" style={{color:'var(--text-dim)'}}>No</span>
    }),
    col.accessor(c.ty,   { header: 'TY',      size: 90, cell: i => <span className="font-mono">{fv(i.getValue())}</span> }),
    col.accessor(c.tyLy, { header: 'TY/LY',   size: 80, cell: i => <Delta value={i.getValue()} /> }),
    col.accessor(c.nyFc, { header: 'NY Fcst',  size: 90, cell: i => <span className="font-mono">{fv(i.getValue())}</span> }),
    col.accessor(c.nyTy, { header: 'NY/TY',   size: 80, cell: i => <Delta value={i.getValue()} /> }),
    col.accessor(c.nyOpt,{ header: 'NY Opt',   size: 90, cell: i => <span className="font-mono" style={{color:'var(--signal)'}}>{fv(i.getValue())}</span> }),
    col.accessor(c.lift, { header: 'Opt Lift', size: 85, cell: i => <Delta value={i.getValue()} /> }),
  ]
}

// Compact KPI row: 4 cards across one row, 3 rows total
function KpiRow({ label, ly, ty, nyFc, nyOpt, lyVal, tyVal, nyFcVal, nyOptVal, tyDelta, nyDelta, liftDelta, isCurrency }) {
  const f = v => v == null ? '—' : (isCurrency ? `$${fmt(v,{compact:true})}` : fmt(v,{compact:true}))
  const cardStyle = (delta) => ({
    background: 'var(--ink-50)',
    borderColor: 'var(--border)',
    borderTopColor: delta == null ? 'var(--border)' : delta >= 0 ? 'var(--signal)' : 'var(--warn)',
  })
  return (
    <div>
      <div className="font-mono uppercase mb-2 px-1"
           style={{color:'var(--text-sec)',letterSpacing:'0.08em',fontSize:'12px',fontWeight:600}}>{label}</div>
      <div className="grid grid-cols-4 gap-3">
        {[
          { l:'Last Year',           v:lyVal,    d:null       },
          { l:'This Year',           v:tyVal,    d:tyDelta,   sub:'vs LY' },
          { l:'NY Forecast',         v:nyFcVal,  d:nyDelta,   sub:'vs TY' },
          { l:'NY Optimised',        v:nyOptVal, d:liftDelta, sub:'Opt Lift' },
        ].map(({ l, v, d, sub }) => (
          <div key={l} className="rounded-xl border p-3" style={cardStyle(d)}>
            <div className="font-mono uppercase mb-1.5"
                 style={{color:'var(--text-sec)',letterSpacing:'0.06em',fontSize:'11px',fontWeight:500}}>{l}</div>
            <div className="font-mono font-semibold" style={{color:'var(--text-pri)',fontSize:'19px'}}>{f(v)}</div>
            {d != null && (
              <div className={`text-xs font-mono mt-1 flex items-center gap-1 ${d >= 0 ? 'delta-pos' : 'delta-neg'}`}>
                {d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}% {sub && <span style={{color:'var(--text-sec)',fontSize:'12px',marginLeft:'2px'}}>{sub}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function KpiSection({ kpis }) {
  if (!kpis) return null
  const { ly, ty, ny_forecast: nf, ny_optimised: no, ty_vs_ly: tvl, ny_vs_ty_forecast: nvt, optimisation_lift: ol } = kpis
  return (
    <div className="px-6 py-4 space-y-4 border-b" style={{borderColor:'var(--border)'}}>
      <KpiRow label="Units"        lyVal={ly?.units}    tyVal={ty?.units}    nyFcVal={nf?.units}    nyOptVal={no?.units}
              tyDelta={tvl?.units_pct}   nyDelta={nvt?.units_pct}   liftDelta={ol?.units_pct} />
      <KpiRow label="Revenue"      lyVal={ly?.revenue}  tyVal={ty?.revenue}  nyFcVal={nf?.revenue}  nyOptVal={no?.revenue}
              tyDelta={tvl?.revenue_pct} nyDelta={nvt?.revenue_pct} liftDelta={ol?.revenue_pct} isCurrency />
      <KpiRow label="Gross Profit" lyVal={ly?.profit}   tyVal={ty?.profit}   nyFcVal={nf?.profit}   nyOptVal={no?.profit}
              tyDelta={tvl?.profit_pct}  nyDelta={nvt?.profit_pct}  liftDelta={ol?.profit_pct} isCurrency />
    </div>
  )
}

export default function SummaryPage() {
  const [filters, setFilters, clearFilters] = usePageFilters('summary')
  const [page,    setPage]    = useState(1)
  const [sorting, setSorting] = useState([{ id: 'ny_lift_revenue_pct', desc: true }])
  const [metric,  setMetric]  = useState('revenue')
  const [pageSize, setPageSize] = useState(50)
  const [downloading, setDownloading] = useState(false)

  const fp = {
    ...(filters.dept_id     && { dept_id:     filters.dept_id     }),
    ...(filters.store_id    && { store_id:    filters.store_id    }),
    ...(filters.category_id && { category_id: filters.category_id }),
    ...(filters.state_id    && { state_id:    filters.state_id    }),
    ...(filters.is_optimised != null && { is_optimised: filters.is_optimised }),
  }

  const { data: kpiData, isLoading: kpiLoading } = useQuery({ queryKey:['kpi-cards',fp], queryFn:()=>getKpiCards(fp) })

  const sortCol  = sorting[0]?.id   || `ny_lift_${metric}_pct`
  const sortDesc = sorting[0]?.desc ?? true

  const { data: tableData, isLoading: tableLoading } = useQuery({
    queryKey: ['ty-ly-ny', fp, page, pageSize, sortCol, sortDesc],
    queryFn:  () => getTyLyNy({ ...fp, page, page_size: pageSize, sort_by: sortCol, sort_desc: sortDesc }),
    keepPreviousData: true,
  })

  const rows       = tableData?.data || []
  const totalPages = tableData?.meta?.total_pages || 1
  const totalRows  = tableData?.meta?.total_rows  || 0
  const columns    = useMemo(() => buildCols(metric), [metric])

  const table = useReactTable({
    data: rows, columns,
    state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    manualSorting: true, manualPagination: true,
  })

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Performance Summary" sub="TY vs LY vs NY — revenue, profit and optimisation impact">
        <span className="text-xs font-mono" style={{color:'var(--text-dim)'}}>{fmt(totalRows)} SKU-stores</span>
      </PageHeader>

      <div className="px-6 py-3 border-b" style={{borderColor:'var(--border)'}}>
        <FilterBar filters={filters} onChange={f => { setFilters(f); setPage(1) }} onClear={() => { clearFilters(); setPage(1) }} />
      </div>

      {kpiLoading ? <div className="p-4"><LoadingState label="Loading KPIs…" /></div> : <KpiSection kpis={kpiData} />}

      {/* Table metric toggle */}
      <div className="px-6 py-2 flex items-center gap-2 border-b" style={{borderColor:'var(--border)'}}>
        <span className="text-xs font-mono uppercase tracking-wider mr-1" style={{color:'var(--text-dim)'}}>Table:</span>
        {['revenue','units','profit'].map(m => (
          <button key={m} onClick={() => { setMetric(m); setSorting([{id:`ny_lift_${m}_pct`,desc:true}]) }}
                  className={metric === m ? 'btn-primary btn' : 'btn-ghost btn'}
                  style={{padding:'3px 12px',textTransform:'capitalize'}}>
            {m}
          </button>
        ))}
        <span className="ml-3 text-xs font-mono" style={{color:'var(--text-dim)'}}>
          · Opt $ = Current $ for non-optimised SKUs
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-mono" style={{color:'var(--text-dim)'}}>Rows:</span>
          <select className="select" style={{width:'80px',padding:'3px 8px'}}
                  value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>
            {[50,100,200,300].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="btn-ghost btn" style={{padding:'3px 10px',fontSize:'12px',opacity:downloading?0.5:1}}
                  disabled={downloading}
                  onClick={async () => {
                    setDownloading(true)
                    try {
                      const res = await getTyLyNy({...fp, page:1, page_size:50000, sort_by:sortCol, sort_desc:sortDesc})
                      const allRows = Array.isArray(res) ? res : (res.data || [])
                      triggerDownload(rowsToCSV(allRows, ['cpi_vs_comp_a','cpi_vs_comp_b']), `performance_summary_${metric}.csv`)
                    } catch(e) { console.error('Download failed:', e) }
                    finally { setDownloading(false) }
                  }}>
            {downloading ? '…' : '↓ CSV'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {tableLoading && rows.length === 0 ? <LoadingState label="Loading…" />
          : rows.length === 0 ? <EmptyState label="No SKUs match selected filters" />
          : <>
              <table className="data-table" style={{tableLayout:'fixed',borderCollapse:'separate',borderSpacing:0}}>
                <thead>
                  {table.getHeaderGroups().map(hg => (
                    <tr key={hg.id}>
                      {hg.headers.map(h => (
                        <th key={h.id} style={{width:h.column.columnDef.size,position:'sticky',top:0,zIndex:2,background:'var(--ink-50)'}}
                            onClick={h.column.getToggleSortingHandler()}
                            className={h.column.getCanSort() ? 'cursor-pointer select-none' : ''}>
                          <div className="flex items-center gap-1">
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {h.column.getIsSorted()==='desc' && <ArrowDown size={10}/>}
                            {h.column.getIsSorted()==='asc'  && <ArrowUp   size={10}/>}
                            {h.column.getCanSort() && !h.column.getIsSorted() && <ArrowUpDown size={10} className="opacity-30"/>}
                          </div>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map(row => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between px-4 py-2 border-t sticky bottom-0 bg-ink-50"
                   style={{borderColor:'var(--border)'}}>
                <span className="text-xs font-mono" style={{color:'var(--text-dim)'}}>
                  Page {page} of {totalPages} · {fmt(totalRows)} rows
                </span>
                <div className="flex gap-2">
                  <button className="btn-ghost btn" style={{padding:'3px 10px'}} disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Prev</button>
                  <button className="btn-ghost btn" style={{padding:'3px 10px'}} disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>Next →</button>
                </div>
              </div>
            </>
        }
      </div>
    </div>
  )
}
