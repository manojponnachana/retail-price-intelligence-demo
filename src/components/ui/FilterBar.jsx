/**
 * FilterBar.jsx
 * =============
 * Chained filters: Region → Store, Category → Department.
 * Props:
 *   filters      - current filter object for this page
 *   onChange     - (updatedFilters) => void
 *   onClear      - () => void  — called when "Clear Filters" clicked
 *   showSku      - show SKU selector (Demand Lab only)
 *   skuOptions   - array of {sku_id, store_id}
 *   showOptimised - show Optimised filter (default true, false for Demand Lab)
 */
import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDepartments, getStores, getCategories } from '../../api/client'

const STATE_PREFIXES = { CA: 'CA_', TX: 'TX_', WI: 'WI_' }
const CAT_DEPT = {
  FOODS:     ['FOODS_1','FOODS_2','FOODS_3'],
  HOBBIES:   ['HOBBIES_1','HOBBIES_2'],
  HOUSEHOLD: ['HOUSEHOLD_1','HOUSEHOLD_2'],
}

export default function FilterBar({
  filters,
  onChange,
  onClear,
  showSku       = false,
  skuOptions    = [],
  showOptimised = true,
}) {
  const { data: depts  } = useQuery({ queryKey: ['departments'], queryFn: getDepartments })
  const { data: stores } = useQuery({ queryKey: ['stores'],      queryFn: () => getStores() })
  const { data: cats   } = useQuery({ queryKey: ['categories'],  queryFn: getCategories })

  const filteredStores = useMemo(() => {
    const all = stores?.data || []
    if (!filters.state_id) return all
    const p = STATE_PREFIXES[filters.state_id]
    return p ? all.filter(s => s.store_id.startsWith(p)) : all
  }, [stores, filters.state_id])

  const filteredDepts = useMemo(() => {
    const all = depts?.data || []
    if (!filters.category_id) return all
    const allowed = CAT_DEPT[filters.category_id] || []
    return all.filter(d => allowed.includes(d.department_id))
  }, [depts, filters.category_id])

  const set = (key, val) => {
    const updated = { ...filters, [key]: (val === '' || val === undefined) ? null : val }
    if (key === 'state_id') {
      const p = val ? STATE_PREFIXES[val] : null
      if (p && filters.store_id && !filters.store_id.startsWith(p)) updated.store_id = null
    }
    if (key === 'category_id') {
      const allowed = val ? (CAT_DEPT[val] || []) : null
      if (allowed && filters.dept_id && !allowed.includes(filters.dept_id)) updated.dept_id = null
    }
    onChange(updated)
  }

  const hasAnyFilter = Object.values(filters).some(v => v != null && v !== '')

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div>
        <label className="label">Region</label>
        <select className="select w-24" value={filters.state_id || ''} onChange={e => set('state_id', e.target.value)}>
          <option value="">All</option>
          {['CA','TX','WI'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Store</label>
        <select className="select w-28" value={filters.store_id || ''} onChange={e => set('store_id', e.target.value)}>
          <option value="">All</option>
          {filteredStores.map(s => <option key={s.store_id} value={s.store_id}>{s.store_id}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Category</label>
        <select className="select w-32" value={filters.category_id || ''} onChange={e => set('category_id', e.target.value)}>
          <option value="">All</option>
          {(cats?.data || []).map(c => <option key={c.category_id} value={c.category_id}>{c.category_id}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Department</label>
        <select className="select w-44" value={filters.dept_id || ''} onChange={e => set('dept_id', e.target.value)}>
          <option value="">All</option>
          {filteredDepts.map(d => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
        </select>
      </div>
      {showOptimised && (
        <div>
          <label className="label">Optimised</label>
          <select className="select w-36" value={filters.is_optimised ?? ''} onChange={e => set('is_optimised', e.target.value === '' ? null : e.target.value === 'true')}>
            <option value="">All SKUs</option>
            <option value="true">Optimised only</option>
            <option value="false">Non-optimised</option>
          </select>
        </div>
      )}
      {showSku && (
        <div>
          <label className="label">SKU</label>
          <select className="select w-56" value={filters.sku_key || ''} onChange={e => set('sku_key', e.target.value)}>
            <option value="">Select SKU…</option>
            {skuOptions.map(s => (
              <option key={`${s.sku_id}__${s.store_id}`} value={`${s.sku_id}__${s.store_id}`}>
                {s.sku_id} / {s.store_id}
              </option>
            ))}
          </select>
        </div>
      )}
      {hasAnyFilter && onClear && (
        <div>
          <label className="label">&nbsp;</label>
          <button className="btn-ghost btn" style={{padding:'5px 12px',fontSize:'12px',color:'var(--warn)',borderColor:'rgba(255,107,53,0.3)'}}
                  onClick={onClear}>
            ✕ Clear Filters
          </button>
        </div>
      )}
    </div>
  )
}
