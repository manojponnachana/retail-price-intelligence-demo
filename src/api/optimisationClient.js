/**
 * optimisationClient.js
 * Optimisation Engine API functions
 */
import axios from 'axios'
import { serializeParams } from './client'

const api = axios.create({ baseURL: '/api', timeout: 30_000 })

export const getJobs        = ()      => api.get('/optimise/jobs').then(r => r.data)
export const getOptSummary  = (p={})  => {
  const params = { ...p }
  if (Array.isArray(params.scenario_ids)) params.scenario_ids = params.scenario_ids.join(",")
  return api.get('/optimise/summary',  { params: serializeParams(params) }).then(r => r.data)
}
export const getOptFrontier = (p={})  => {
  const params = { ...p }
  if (Array.isArray(params.scenario_ids)) params.scenario_ids = params.scenario_ids.join(",")
  return api.get('/optimise/frontier', { params: serializeParams(params) }).then(r => r.data)
}
export const getOptResults  = (p={})  => api.get('/optimise/results',  { params: serializeParams(p) }).then(r => r.data)
export const getConstraints = (skuId, storeId, p={}) =>
  api.get(`/optimise/constraints/${skuId}/${storeId}`, { params: serializeParams(p) }).then(r => r.data)
