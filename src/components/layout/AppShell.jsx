import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { TrendingUp, BarChart3, Activity, Zap, Target } from 'lucide-react'
import clsx from 'clsx'

const NAV = [
  { to: '/trend',        icon: TrendingUp, label: 'Trend',        sub: 'Historical & Forecast' },
  { to: '/demand',       icon: Activity,   label: 'Demand',       sub: 'Elasticity & Curves'   },
  { to: '/optimisation', icon: Target,     label: 'Optimisation', sub: 'Scenarios & Frontier'  },
  { to: '/summary',      icon: BarChart3,  label: 'Summary',      sub: 'TY vs LY vs NY'        },
]

export default function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-ink">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="w-56 flex flex-col border-r shrink-0"
             style={{
               background: 'rgba(10,14,26,0.75)',
               borderColor: 'rgba(255,255,255,0.08)',
               backdropFilter: 'blur(20px)',
               WebkitBackdropFilter: 'blur(20px)',
             }}>
             

        {/* Logo */}
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                 style={{ background: 'var(--signal)' }}>
              <Zap size={14} className="text-ink" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-mono text-sm font-medium text-pri leading-none">
                PriceIQ
              </div>
              <div className="font-mono text-xs leading-none mt-0.5"
                   style={{ color: 'var(--text-dim)' }}>
                Intelligence Engine
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, icon: Icon, label, sub }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150',
                isActive
                  ? 'text-ink'
                  : 'hover:bg-white/5 text-sec'
              )}
              style={({ isActive }) => isActive
                ? { background: 'var(--signal)', color: 'var(--ink)' }
                : {}
              }
            >
              <Icon size={15} strokeWidth={2} />
              <div>
                <div className="text-sm font-medium leading-none">{label}</div>
                <div className={clsx('text-xs leading-none mt-0.5 font-mono',
                     'opacity-70')}>{sub}</div>
              </div>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
            M5 · Proof of Concept
          </div>
          <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>
            v1.0.0
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
