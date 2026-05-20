/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"DM Mono"', 'monospace'],
        body:    ['"DM Sans"', 'sans-serif'],
        mono:    ['"DM Mono"', 'monospace'],
      },
      colors: {
        ink:    { DEFAULT: '#0A0E1A', 50: '#1a2035', 100: '#141828' },
        slate:  { 750: '#2a3347', 850: '#1d2539' },
        signal: { DEFAULT: '#00E5A0', dim: '#00b87f', muted: '#00e5a015' },
        warn:   { DEFAULT: '#FF6B35', dim: '#cc5228'  },
        sky:    { DEFAULT: '#4FC3F7', dim: '#2997c8'  },
        gold:   { DEFAULT: '#FFD700', dim: '#ccac00'  },
      },
      backgroundImage: {
        'grid-ink': 'linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid-sm': '24px 24px',
      },
    }
  },
  plugins: []
}
