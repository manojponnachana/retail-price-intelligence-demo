import React, { useState, useMemo, useEffect } from 'react'
import { usePageFilters } from '../FilterContext'
import { useQuery } from '@tanstack/react-query'
import { getDemandCurve, getRevenueProfitCurve, getTyLyNy, simulatePortfolio } from '../api/client'
import FilterBar from '../components/ui/FilterBar'
import PlotChart, { COLORS } from '../components/charts/PlotChart'
import { PageHeader, QualityBadge, TierBadge, Delta, SectionTitle, LoadingState, EmptyState, Stat, fmt } from '../components/ui/ui'

function calcImpact(inputs, newPrice) {
  if (!inputs || !newPrice || newPrice <= 0) return null
  const { ny_forecast_units: base, current_price, unit_cost, elasticity_coefficient: e } = inputs
  if (!base || !current_price || !e) return null
  const ratio = Math.max(newPrice / current_price, 0.001)

  // Raw fractional units from elasticity equation
  const nuRaw = base * Math.pow(ratio, e)

  // Round to nearest integer — same as optimiser behaviour
  // Units < 0.5 round to 0 (can't sell a fraction of a unit)
  const nu = Math.round(nuRaw)

  // When rounded units = 0, revenue and profit are also 0
  const nr = nu > 0 ? newPrice * nu : 0
  const np = nu > 0 ? (newPrice - unit_cost) * nu : 0

  // Base metrics (also integer-rounded for consistency)
  const baseRounded = Math.round(base)
  const fr = current_price * baseRounded
  const fp = (current_price - unit_cost) * baseRounded

  const pct = (nv, ov) => ov ? ((nv - ov) / Math.abs(ov) * 100).toFixed(1) : null
  return {
    newUnits: nu,
    newRev:   nr.toFixed(2),
    newProf:  np.toFixed(2),
    unitsPct: pct(nu,  baseRounded),
    revPct:   pct(nr,  fr),
    profPct:  pct(np,  fp),
    unitsAbs: (nu - baseRounded).toFixed(0),
    revAbs:   (nr - fr).toFixed(2),
    profAbs:  (np - fp).toFixed(2),
  }
}

export default function DemandPage() {
  const [filters, setFilters, clearFilters] = usePageFilters('demand')
  // sku_key is local — not shared across pages (SKU filter is Demand Lab specific)
  const [skuKey, setSkuKey] = useState(filters.sku_key || null)

  const setFiltersWithSku = (f) => {
    setSkuKey(f.sku_key || null)
    const { sku_key, ...shared } = f
    setFilters(shared)
  }

  // Merge sku_key back for FilterBar display
  const filtersWithSku = { ...filters, sku_key: skuKey }
  const [customPrice, setCustomPrice] = useState('')
  const [portFilter,  setPortFilter]  = useState({ dept_id:'', pct:'5', category_id:null, store_ids:[], is_optimised:null })
  const [portResult,  setPortResult]  = useState(null)
  const [portLoading, setPortLoading] = useState(false)

  const [skuId, storeId] = useMemo(() => {
    if (!skuKey) return [null,null]
    const p = skuKey.split('__')
    return [p[0], p[1]]
  }, [skuKey])

  useEffect(() => { setCustomPrice('') }, [skuKey])

  const skuParams = {
    ...(filters.dept_id     && { dept_id:     filters.dept_id     }),
    ...(filters.store_id    && { store_id:    filters.store_id    }),
    ...(filters.category_id && { category_id: filters.category_id }),
    ...(filters.state_id    && { state_id:    filters.state_id    }),

    page_size: 500, sort_by: 'sku_id', sort_desc: false,
  }

  const { data: skuList } = useQuery({
    queryKey: ['sku-list', skuParams],
    queryFn:  () => getTyLyNy(skuParams),
  })
  const skuOptions = useMemo(() => {
    const rows = skuList?.data || []
    return [...rows].sort((a,b) => a.sku_id.localeCompare(b.sku_id))
  }, [skuList])

  const skuMeta = useMemo(() =>
    skuOptions.find(s => s.sku_id === skuId && s.store_id === storeId) || null,
    [skuId, storeId, skuOptions]
  )

  const iterInputs = skuMeta ? {
    ny_forecast_units:      skuMeta.next_year_forecast_units,
    current_price:          skuMeta.current_price,
    unit_cost:              skuMeta.unit_cost,
    elasticity_coefficient: skuMeta.elasticity_coefficient,
    ny_forecast_revenue:    skuMeta.next_year_forecast_revenue,
    ny_forecast_profit:     skuMeta.next_year_forecast_profit,
  } : null

  const { data: curveData, isLoading: curveLoading } = useQuery({
    queryKey: ['demand-curve', skuId, storeId],
    queryFn:  () => getDemandCurve(skuId, storeId),
    enabled:  !!skuId && !!storeId,
  })

  const { data: rpData, isLoading: rpLoading } = useQuery({
    queryKey: ['rev-profit-curve', skuId, storeId],
    queryFn:  () => getRevenueProfitCurve(skuId, storeId),
    enabled:  !!skuId && !!storeId,
  })

  const impact = useMemo(() => calcImpact(iterInputs, parseFloat(customPrice)), [iterInputs, customPrice])

  // Demand curve — only ONE marker per special point, autorange resets on SKU change
  const demandTraces = useMemo(() => {
    const pts = curveData?.curve_points || []
    if (!pts.length) return []
    const traces = [{
      x: pts.map(p=>p.price), y: pts.map(p=>p.units),
      type:'scatter', mode:'lines', name:'Demand Curve',
      line: { color: COLORS.sky, width: 2 },
      hovertemplate: '$%{x:.2f} → %{y:,.1f} units<extra></extra>',
    }]
    // Only add current price marker once — prefer precomputed, skip if calculating on-the-fly
    const cp = curveData?.current_point
    if (cp && cp.price != null) {
      traces.push({
        x:[cp.price], y:[cp.units],
        type:'scatter', mode:'markers', name:'Current Price',
        marker:{size:12, color:COLORS.warn, symbol:'diamond'},
        hovertemplate:'Current: $%{x:.2f} → %{y:,.1f} units<extra></extra>',
      })
    }
    return traces
  }, [curveData])

  // Revenue vs Profit: Price on X, Revenue on left Y, Profit on right Y
  // Alpha values shown as vertical markers on secondary X axis (top)
  const rpTraces = useMemo(() => {
    const curve = rpData?.curve || []
    if (!curve.length) return []
    return [
      {
        x: curve.map(p=>p.price), y: curve.map(p=>p.revenue),
        name:'Revenue', type:'scatter', mode:'lines',
        line:{color:COLORS.sky, width:2},
        hovertemplate:'$%{x:.2f} → Revenue: $%{y:,.0f}<extra></extra>',
      },
      {
        x: curve.map(p=>p.price), y: curve.map(p=>p.profit),
        name:'Profit', type:'scatter', mode:'lines',
        line:{color:COLORS.signal, width:2},
        yaxis:'y2',
        hovertemplate:'$%{x:.2f} → Profit: $%{y:,.0f}<extra></extra>',
      },
    ]
  }, [rpData])

  // Optimal price markers for each alpha
  const optMarkers = useMemo(() => {
    if (!rpData?.optimal_prices) return []
    const { alpha_0_profit: p0, alpha_05_balanced: p05, alpha_1_revenue: p1 } = rpData.optimal_prices
    const markers = []
    if (p0)  markers.push({ x:[p0.price],  name:'Max Revenue (α=0)',  color:COLORS.signal, sym:'triangle-up' })
    if (p1)  markers.push({ x:[p1.price],  name:'Max Profit (α=1.0)', color:COLORS.sky,    sym:'triangle-up' })
    return markers.map(m => {
      const curve = rpData.curve || []
      const pt = curve.find(c => c.price === m.x[0]) || curve.reduce((a,b) => Math.abs(b.price-m.x[0]) < Math.abs(a.price-m.x[0]) ? b : a, curve[0] || {})
      return {
        x:m.x, y:[pt?.revenue ?? 0],
        type:'scatter', mode:'markers', name:m.name,
        marker:{size:12, color:m.color, symbol:m.sym},
        hovertemplate:`${m.name}: $%{x:.2f}<extra></extra>`,
      }
    })
  }, [rpData])

  const runPortSim = async () => {
    setPortLoading(true)
    try {
      const r = await simulatePortfolio({
        price_change_pct: parseFloat(portFilter.pct) || 5,
        ...(portFilter.dept_id     && { dept_id:     portFilter.dept_id }),
        ...(portFilter.category_id && { category_id: portFilter.category_id }),
        ...(portFilter.store_ids?.length && { store_ids: portFilter.store_ids }),
        ...(portFilter.is_optimised != null && { is_optimised: portFilter.is_optimised }),
      })
      setPortResult(r)
    } catch(e) { console.error(e) }
    finally { setPortLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Demand Lab" sub="Elasticity, demand curves and price impact simulation" />

      <div className="px-6 py-3 border-b" style={{borderColor:'var(--border)'}}>
        <FilterBar filters={filtersWithSku} onChange={setFiltersWithSku} onClear={clearFilters} showSku skuOptions={skuOptions} showOptimised={false} />
      </div>

      {!skuKey && (
        <div className="px-6 py-2.5 border-b" style={{borderColor:'var(--border)'}}>
          <span className="text-sm font-mono" style={{color:'var(--text-sec)'}}>
            Apply filters above then select a SKU to view demand curves and run price simulations.
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* SKU context strip */}
        {skuMeta && (
          <div className="mx-6 mt-4 p-4 card flex flex-wrap gap-5 items-center">
            <div><div className="label">SKU</div><div className="font-mono text-sm text-pri">{skuMeta.sku_id}</div></div>
            <div><div className="label">Store</div><div className="font-mono text-sm text-pri">{skuMeta.store_id}</div></div>
            <div><div className="label">Tier</div><TierBadge tier={skuMeta.sku_tier} /></div>
            <div>
              <div className="label">Elasticity</div>
              <div className="font-mono text-sm" style={{color:'var(--sky)'}}>{skuMeta.elasticity_coefficient?.toFixed(3) ?? '—'}</div>
            </div>
            <div>
              <div className="label">Beta Source</div>
              {skuMeta.elasticity_source || skuMeta.stage4_prior_source || skuMeta.elasticity_quality
                ? <span className="font-mono text-xs" style={{color:'var(--sky)'}}>
                    {skuMeta.elasticity_source || skuMeta.stage4_prior_source || skuMeta.elasticity_quality}
                  </span>
                : <span className="text-xs font-mono" style={{color:'var(--text-dim)'}}>—</span>}
            </div>
            <div><div className="label">Current Price</div><div className="font-mono text-sm text-pri">${skuMeta.current_price?.toFixed(2) ?? '—'}</div></div>

          </div>
        )}

        {/* Charts */}
        {skuId && (
          <div className="grid grid-cols-2 gap-4 mx-6 mt-4">
            <div className="card p-4" style={{height:310}}>
              <SectionTitle>Demand Curve — Units at Price</SectionTitle>
              {curveLoading ? <LoadingState label="Loading…" />
                : demandTraces.length
                ? <div style={{height:250}}>
                    <PlotChart
                      key={`dc-${skuId}-${storeId}`}
                      data={demandTraces}
                      layout={{
                        xaxis:{title:'Price ($)', autorange:true},
                        yaxis:{title:'Units',     autorange:true},
                        margin:{t:8,r:16,b:40,l:55},
                        legend:{orientation:'h', x:0, y:-0.18, font:{size:10}, bgcolor:'rgba(0,0,0,0)'},
                      }}
                      config={{scrollZoom:true, displayModeBar:true, displaylogo:false,
                               modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d',
                                 'hoverClosestCartesian','hoverCompareCartesian','toggleSpikelines'],
                               toImageButtonOptions:{format:'png',scale:2}}}
                    />
                  </div>
                : <EmptyState label="No demand curve data" />
              }
            </div>

            <div className="card p-4" style={{height:310}}>
              <SectionTitle>Revenue vs Profit at Different Prices</SectionTitle>
              {!Boolean(skuMeta?.is_optimised)
                ? <div className="flex flex-col items-center justify-center h-48 gap-2">
                    <span className="text-sm font-mono" style={{color:'var(--text-sec)'}}>
                      Not available for non-optimised SKUs
                    </span>
                    <span className="text-xs font-mono" style={{color:'var(--text-dim)'}}>
                      Unconstrained prices are generated only for SKUs in the optimisation run
                    </span>
                  </div>
                : rpLoading ? <LoadingState label="Loading…" />
                : rpTraces.length
                ? <div style={{height:250}}>
                    <PlotChart
                      key={`rp-${skuId}-${storeId}`}
                      data={[...rpTraces, ...optMarkers]}
                      layout={{
                        xaxis:{title:'Price ($)', autorange:true},
                        yaxis:{title:'Revenue ($)', autorange:true, titlefont:{color:COLORS.sky}, tickfont:{color:COLORS.sky}},
                        yaxis2:{title:'Profit ($)', overlaying:'y', side:'right', autorange:true,
                                titlefont:{color:COLORS.signal}, tickfont:{color:COLORS.signal},
                                gridcolor:'transparent'},
                        margin:{t:8,r:65,b:40,l:60},
                        legend:{orientation:'h', x:0, y:-0.18, font:{size:10}, bgcolor:'rgba(0,0,0,0)'},
                      }}
                      config={{scrollZoom:true, displayModeBar:true, displaylogo:false,
                               modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d',
                                 'hoverClosestCartesian','hoverCompareCartesian','toggleSpikelines'],
                               toImageButtonOptions:{format:'png',scale:2}}}
                    />
                  </div>
                : <EmptyState label="No optimisation data for this SKU" />
              }
            </div>
          </div>
        )}

        {/* Calculator + Portfolio */}
        <div className="grid grid-cols-2 gap-4 mx-6 mt-4 mb-6">
          <div className="card p-5">
            <SectionTitle>Price Impact Calculator</SectionTitle>
            {!skuMeta
              ? <span className="text-sm font-mono" style={{color:'var(--text-sec)'}}>Select a SKU above.</span>
              : <>
                  <div className="mb-4">
                    <label className="label">Enter New Price ($)</label>
                    <input type="number" min="0" step="0.01" className="input w-40"
                           value={customPrice} onChange={e => setCustomPrice(e.target.value)}
                           placeholder={skuMeta.current_price?.toFixed(2)||''} />
                    <div className="text-xs font-mono mt-1" style={{color:'var(--text-dim)'}}>
                      Annual basis · elasticity ({iterInputs?.elasticity_coefficient?.toFixed(2)}) · base {fmt(iterInputs?.ny_forecast_units)} units/yr
                    </div>
                  </div>
                  {impact && (
                    <div className="mt-3">
                      <div className="text-xs font-mono mb-2" style={{color:'var(--text-dim)'}}>
                        vs 52-week forecast at current price (${iterInputs?.current_price?.toFixed(2)}) · elasticity {iterInputs?.elasticity_coefficient?.toFixed(2)}
                      </div>
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr>
                            {['Metric','Forecast (Base)','New Price','Change','Change %'].map(h => (
                              <th key={h} className="text-left pb-1.5 pr-3" style={{color:'var(--text-dim)',borderBottom:'1px solid var(--border)'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            {
                              label: 'Units / yr',
                              base:  fmt(Math.round(iterInputs.ny_forecast_units)),
                              new_:  fmt(impact.newUnits),
                              abs:   `${parseInt(impact.unitsAbs) >= 0 ? '+' : ''}${fmt(parseInt(impact.unitsAbs))}`,
                              pct:   parseFloat(impact.unitsPct),
                            },
                            {
                              label: 'Revenue',
                              base:  `$${fmt(iterInputs.ny_forecast_revenue, {compact:true})}`,
                              new_:  `$${parseFloat(impact.newRev).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`,
                              abs:   `${parseFloat(impact.revAbs) >= 0 ? '+' : ''}$${Math.abs(parseFloat(impact.revAbs)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`,
                              pct:   parseFloat(impact.revPct),
                            },
                            {
                              label: 'Profit',
                              base:  `$${fmt(iterInputs.ny_forecast_profit, {compact:true})}`,
                              new_:  `$${parseFloat(impact.newProf).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`,
                              abs:   `${parseFloat(impact.profAbs) >= 0 ? '+' : ''}$${Math.abs(parseFloat(impact.profAbs)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`,
                              pct:   parseFloat(impact.profPct),
                            },
                          ].map(row => (
                            <tr key={row.label} style={{borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                              <td className="py-1.5 pr-3" style={{color:'var(--text-sec)'}}>{row.label}</td>
                              <td className="py-1.5 pr-3" style={{color:'var(--text-pri)'}}>{row.base}</td>
                              <td className="py-1.5 pr-3" style={{color:'var(--text-pri)'}}>{row.new_}</td>
                              <td className="py-1.5 pr-3" style={{color: parseFloat(row.abs) >= 0 ? 'var(--signal)' : 'var(--warn)'}}>{row.abs}</td>
                              <td className="py-1.5" style={{color: row.pct >= 0 ? 'var(--signal)' : 'var(--warn)'}}>
                                {row.pct >= 0 ? '▲' : '▼'} {Math.abs(row.pct).toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
            }
          </div>

          <div className="card p-5">
            <SectionTitle>Portfolio Impact Simulator</SectionTitle>
            <div className="text-xs font-mono mb-3" style={{color:'var(--text-sec)'}}>
              Uniform % price change applied to all matching SKUs.
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="label">Department</label>
                <select className="select w-full" value={portFilter.dept_id}
                        onChange={e => setPortFilter(p=>({...p,dept_id:e.target.value}))}>
                  <option value="">All Depts</option>
                  {['FOODS_1','FOODS_2','FOODS_3','HOBBIES_1','HOBBIES_2','HOUSEHOLD_1','HOUSEHOLD_2'].map(d =>
                    <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Category</label>
                <select className="select w-full" value={portFilter.category_id || ''}
                        onChange={e => setPortFilter(p=>({...p,category_id:e.target.value||null}))}>
                  <option value="">All Categories</option>
                  {['FOODS','HOBBIES','HOUSEHOLD'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Stores (hold Cmd/Ctrl to select multiple)</label>
                <select multiple className="select w-full" style={{height:'80px'}}
                        value={portFilter.store_ids || []}
                        onChange={e => setPortFilter(p=>({
                          ...p,
                          store_ids: Array.from(e.target.selectedOptions).map(o=>o.value)
                        }))}>
                  {['CA_1','CA_2','CA_3','CA_4','TX_1','TX_2','TX_3','WI_1','WI_2','WI_3'].map(s =>
                    <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="text-xs font-mono mt-1" style={{color:'var(--text-dim)'}}>
                  {portFilter.store_ids?.length ? `${portFilter.store_ids.length} store(s) selected` : 'All stores'}
                </div>
              </div>
              <div>
                <label className="label">Price Change %</label>
                <input type="number" step="0.5" className="input w-full"
                       value={portFilter.pct} onChange={e => setPortFilter(p=>({...p,pct:e.target.value}))} />
              </div>
              <div>
                <label className="label">Optimised SKUs</label>
                <select className="select w-full" value={portFilter.is_optimised ?? ''}
                        onChange={e => setPortFilter(p=>({
                          ...p, is_optimised: e.target.value==='' ? null : e.target.value==='true'
                        }))}>
                  <option value="">All SKUs</option>
                  <option value="true">Optimised only</option>
                  <option value="false">Non-optimised</option>
                </select>
              </div>
            </div>
            <button className="btn-primary btn w-full justify-center mb-3"
                    onClick={runPortSim} disabled={portLoading}>
              {portLoading ? 'Calculating…' : 'Run Simulation'}
            </button>
            {portResult && (
              <div className="mt-1">
                <div className="text-xs font-mono mb-2" style={{color:'var(--text-dim)'}}>
                  {portResult.inputs.sku_count} SKUs · {portResult.inputs.price_change_pct > 0 ? '+' : ''}{portResult.inputs.price_change_pct}% price change · vs 52-week forecast base
                </div>
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr>
                      {['Metric','Forecast (Base)','New Price','Change','Change %'].map(h => (
                        <th key={h} className="text-left pb-1.5 pr-3" style={{color:'var(--text-dim)',borderBottom:'1px solid var(--border)'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label:'Units / yr',  data: portResult.portfolio_impact.units,   fmt_: v => fmt(v), prefix:''  },
                      { label:'Revenue',     data: portResult.portfolio_impact.revenue, fmt_: v => `$${fmt(v,{compact:true})}`, prefix:'$' },
                      { label:'Profit',      data: portResult.portfolio_impact.profit,  fmt_: v => `$${fmt(v,{compact:true})}`, prefix:'$' },
                    ].map(row => {
                      const abs = row.data.after - row.data.before
                      const pct = row.data.change_pct
                      return (
                        <tr key={row.label} style={{borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                          <td className="py-1.5 pr-3" style={{color:'var(--text-sec)'}}>{row.label}</td>
                          <td className="py-1.5 pr-3" style={{color:'var(--text-pri)'}}>{row.fmt_(row.data.before)}</td>
                          <td className="py-1.5 pr-3" style={{color:'var(--text-pri)'}}>{row.fmt_(row.data.after)}</td>
                          <td className="py-1.5 pr-3" style={{color: abs >= 0 ? 'var(--signal)' : 'var(--warn)'}}>
                            {abs >= 0 ? '+' : ''}{row.prefix}{Math.abs(abs).toLocaleString(undefined,{maximumFractionDigits:0})}
                          </td>
                          <td className="py-1.5" style={{color: pct >= 0 ? 'var(--signal)' : 'var(--warn)'}}>
                            {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="mt-2 text-xs font-mono" style={{color:'var(--text-dim)'}}>
                  Median elasticity: {portResult.sku_distribution.elasticity_median?.toFixed(2)} · SKUs gaining revenue: {portResult.sku_distribution.n_revenue_gain} / {portResult.inputs.sku_count}
                </div>
                <div className="mt-1 text-xs font-mono" style={{color:'var(--text-dim)'}}>
                  Per-SKU elasticity used. Cross-SKU substitution not modelled.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
