/**
 * PlotChart.jsx
 * =============
 * Thin wrapper around react-plotly.js with the app's dark theme baked in.
 * All charts in the app use this component — ensures visual consistency.
 */

import React from 'react'
import Plot from 'react-plotly.js'

// ── Shared dark layout defaults ───────────────────────────────────────────────
const BASE_LAYOUT = {
  paper_bgcolor: 'transparent',
  plot_bgcolor:  'transparent',
  font: {
    family: 'DM Mono, monospace',
    size:   11,
    color:  '#8892A4',
  },
  margin: { t: 30, r: 16, b: 50, l: 52 },
  xaxis: {
    gridcolor:    'rgba(255,255,255,0.04)',
    zerolinecolor:'rgba(255,255,255,0.08)',
    tickfont:     { size: 10, color: '#505A6B' },
    linecolor:    'rgba(255,255,255,0.06)',
  },
  yaxis: {
    gridcolor:    'rgba(255,255,255,0.04)',
    zerolinecolor:'rgba(255,255,255,0.08)',
    tickfont:     { size: 10, color: '#505A6B' },
    linecolor:    'rgba(255,255,255,0.06)',
  },
  legend: {
    bgcolor:     'rgba(0,0,0,0)',
    bordercolor: 'rgba(255,255,255,0.06)',
    borderwidth: 1,
    font:        { size: 10, color: '#8892A4' },
    x: 0, y: -0.15,
    orientation: 'h',
  },
  hovermode: 'closest',
  hoverlabel: {
    bgcolor:     '#1d2539',
    bordercolor: 'rgba(255,255,255,0.1)',
    font:        { family: 'DM Mono, monospace', size: 11, color: '#E8EDF5' },
  },
}

const BASE_CONFIG = {
  displayModeBar:  true,
  displaylogo:     false,
  modeBarButtonsToRemove: [
    'select2d', 'lasso2d', 'autoScale2d', 'hoverClosestCartesian',
    'hoverCompareCartesian', 'toggleSpikelines',
  ],
  responsive: true,
  toImageButtonOptions: { format: 'png', scale: 2 },
}

// Move modebar above the chart via CSS — inject once
if (typeof document !== 'undefined' && !document.getElementById('plotly-modebar-style')) {
  const style = document.createElement('style')
  style.id = 'plotly-modebar-style'
  style.textContent = `
    .js-plotly-plot .plotly .modebar {
      top: -32px !important;
      right: 0 !important;
    }
  `
  document.head.appendChild(style)
}

// ── Colour palette for traces ─────────────────────────────────────────────────
export const COLORS = {
  signal: '#00E5A0',
  sky:    '#4FC3F7',
  warn:   '#FF6B35',
  gold:   '#FFD700',
  purple: '#B39DDB',
  pink:   '#F48FB1',
  dimGreen: 'rgba(0,229,160,0.25)',
  dimBlue:  'rgba(79,195,247,0.25)',
  dimWarn:  'rgba(255,107,53,0.25)',
}

export default function PlotChart({
  data,
  layout = {},
  config = {},
  style = {},
  className = '',
}) {
  const mergedLayout = {
    ...BASE_LAYOUT,
    ...layout,
    xaxis: { ...BASE_LAYOUT.xaxis, ...(layout.xaxis || {}) },
    yaxis: { ...BASE_LAYOUT.yaxis, ...(layout.yaxis || {}) },
    legend: { ...BASE_LAYOUT.legend, ...(layout.legend || {}) },
    hoverlabel: { ...BASE_LAYOUT.hoverlabel, ...(layout.hoverlabel || {}) },
  }

  return (
    <Plot
      data={data}
      layout={mergedLayout}
      config={{ ...BASE_CONFIG, ...config }}
      style={{ width: '100%', height: '100%', ...style }}
      className={className}
      useResizeHandler
    />
  )
}
