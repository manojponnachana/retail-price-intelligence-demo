/**
 * FilterContext.jsx
 * =================
 * Per-page filter state. Each page has its own independent filter slice.
 * Filters persist across navigation but never bleed between pages.
 * Reset only via "Clear Filters" button or browser close.
 */
import React, { createContext, useContext, useState } from 'react'

const FilterContext = createContext(null)

const PAGES = ['trend', 'summary', 'demand', 'optimisation']
const EMPTY = Object.fromEntries(PAGES.map(p => [p, {}]))

export function FilterProvider({ children }) {
  const [pageFilters, setPageFilters] = useState(EMPTY)

  function getFilters(page) {
    return pageFilters[page] || {}
  }

  function setFilters(page, updated) {
    setPageFilters(prev => ({ ...prev, [page]: updated }))
  }

  function clearFilters(page) {
    setPageFilters(prev => ({ ...prev, [page]: {} }))
  }

  return (
    <FilterContext.Provider value={{ getFilters, setFilters, clearFilters }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilters() {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilters must be used inside FilterProvider')
  return ctx
}

// Convenience hook for a specific page — returns [filters, setFilters, clearFilters]
export function usePageFilters(page) {
  const { getFilters, setFilters, clearFilters } = useFilters()
  return [
    getFilters(page),
    (updated) => setFilters(page, updated),
    () => clearFilters(page),
  ]
}
