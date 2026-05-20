/**
 * src/api/client.js
 * =================
 * Axios instance + typed API functions for all backend endpoints.
 * All requests go through /api/* which Vite proxies to localhost:8000.
 *
 * Convention:
 *   - Functions return the .data property of the response directly
 *   - All column names use standard names (never raw internal names)
 *   - Error handling is left to React Query — functions just fetch
 */

import axios from 'axios'

// Serializer that preserves false boolean values as strings
// Axios by default drops false values from params — this prevents that
export function serializeParams(params) {
  const result = {}
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue
    // Convert boolean to string so FastAPI receives "true"/"false" not dropped
    result[k] = typeof v === 'boolean' ? String(v) : v
  }
  return result
}

const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Reference data ────────────────────────────────────────────────────────────

export const getDepartments = () =>
  api.get('/data/departments').then(r => r.data)

export const getStores = (deptId = null) =>
  api.get('/data/stores', { params: deptId ? { dept_id: deptId } : {} }).then(r => r.data)

export const getCategories = () =>
  api.get('/data/categories').then(r => r.data)

export const getCpiSummary = (params = {}) =>
  api.get('/data/cpi-summary', { params }).then(r => r.data)

// ── Trend chart ───────────────────────────────────────────────────────────────

export const getTrend = (params = {}) =>
  api.get('/data/trend', { params: serializeParams(params) }).then(r => r.data)

export const getSkuSeries = (skuId, storeId) =>
  api.get(`/data/sku/${skuId}/${storeId}`).then(r => r.data)

// ── Summary / Decision Studio ─────────────────────────────────────────────────

export const getKpiCards = (params = {}) =>
  api.get('/summary/kpi-cards', { params: serializeParams(params) }).then(r => r.data)

export const getTyLyNy = (params = {}) =>
  api.get('/summary/ty-ly-ny', { params: serializeParams(params) }).then(r => r.data)

export const getPriceRecommendation = (skuId, storeId) =>
  api.get(`/summary/price/${skuId}/${storeId}`).then(r => r.data)

// ── Demand Lab ────────────────────────────────────────────────────────────────

export const getElasticity = (params = {}) =>
  api.get('/demand/elasticity', { params: serializeParams(params) }).then(r => r.data)

export const getDemandCurve = (skuId, storeId) =>
  api.get(`/demand/curve/${skuId}/${storeId}`).then(r => r.data)

export const getRevenueProfitCurve = (skuId, storeId) =>
  api.get(`/demand/revenue-profit/${skuId}/${storeId}`).then(r => r.data)

export const simulatePrice = (skuId, storeId, newPrice) =>
  api.post('/demand/simulate', { sku_id: skuId, store_id: storeId, new_price: newPrice })
     .then(r => r.data)

export const simulatePortfolio = (payload) =>
  api.post('/demand/simulate-portfolio', payload).then(r => r.data)

// ── Forecast ──────────────────────────────────────────────────────────────────

export const getForecastSummary = (params = {}) =>
  api.get('/forecast/summary', { params: serializeParams(params) }).then(r => r.data)

export const getSkuForecast = (skuId, storeId) =>
  api.get(`/forecast/sku/${skuId}/${storeId}`).then(r => r.data)

// ── Utilities ─────────────────────────────────────────────────────────────────

export const clearCache = () =>
  api.post('/cache/clear').then(r => r.data)
