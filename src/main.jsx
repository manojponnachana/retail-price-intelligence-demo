import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'

import { FilterProvider } from './FilterContext'
import AppShell    from './components/layout/AppShell'
import TrendPage   from './pages/TrendPage'
import SummaryPage from './pages/SummaryPage'
import DemandPage        from './pages/DemandPage'
import OptimisationPage from './pages/OptimisationPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5*60*1000, retry: 1, refetchOnWindowFocus: false } }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <FilterProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AppShell />}>
              <Route index element={<Navigate to="/trend" replace />} />
              <Route path="trend"   element={<TrendPage />} />
              <Route path="summary" element={<SummaryPage />} />
              <Route path="demand"  element={<DemandPage />} />
              <Route path="optimisation" element={<OptimisationPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </FilterProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
