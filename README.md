# PriceIQ — Retail Price Intelligence Engine

> AI-powered pricing analytics and optimisation platform built on Walmart M5 retail data.
> Live demo available — no login required.

**[→ Live Demo](https://sample-project-v1-495106.web.app)**

![Tech Stack](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React_18-61DAFB?style=flat&logo=react&logoColor=black)
![GCP](https://img.shields.io/badge/Google_Cloud-4285F4?style=flat&logo=googlecloud&logoColor=white)
![Python](https://img.shields.io/badge/Python_3.11-3776AB?style=flat&logo=python&logoColor=white)

---

## What it does

PriceIQ is a full-stack retail analytics platform that combines demand forecasting, price elasticity estimation, and constrained price optimisation into a single interactive app. Built as a proof of concept on the Walmart M5 Kaggle dataset (~30,000 SKU-store combinations across 3 US states).

The app answers three practical questions retailers face every week:

1. **How is demand trending?** Historical actuals vs forecast vs price-optimised projection
2. **How price-sensitive are my products?** Demand curves, elasticity coefficients, revenue/profit trade-offs at any price point
3. **What prices maximise revenue or profit?** Scenario-based optimisation with real business constraints (competitor bounds, margin floors, max price change limits)

---

## Screenshots

### Trend Analysis
*Weekly actuals (LY/TY) + 52-week demand forecast + price-optimised projection*

<!-- Replace with your screenshot -->
![Trend Analysis](https://user-images.githubusercontent.com/placeholder/trend.png)

---

### Demand Lab
*Price elasticity, demand curves, and price impact simulation per SKU*

<!-- Replace with your screenshot -->
![Demand Lab](https://user-images.githubusercontent.com/placeholder/demand.png)

---

### Optimisation Studio — Scenario Comparison
*Side-by-side KPI cards comparing baseline vs quantity-constrained optimisation scenarios, with Competitive Pricing Index (CPI) vs Comp A and Comp B*

<!-- Replace with your screenshot -->
![Optimisation Scenarios](https://user-images.githubusercontent.com/placeholder/opt_scenarios.png)

---

### Optimisation Studio — SKU Results Table
*Per-SKU price recommendations, elasticity, competitor prices, and optimisation lift*

<!-- Replace with your screenshot -->
![Optimisation SKU Table](https://user-images.githubusercontent.com/placeholder/opt_table.png)

---

### Optimisation Studio — Constraint Diagram
*Visual breakdown of binding constraints per SKU: cost floor, ±20% price change limit, competitor A/B bounds, department margin floor*

<!-- Replace with your screenshot -->
![Constraint Diagram](https://user-images.githubusercontent.com/placeholder/opt_constraints.png)

---

### Performance Summary
*Annual LY / TY / NY comparison across all 30,444 SKU-stores with optimisation lift*

<!-- Replace with your screenshot -->
![Performance Summary](https://user-images.githubusercontent.com/placeholder/summary.png)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Firebase Hosting                      │
│              React 18 + Vite (CDN, HTTPS)               │
└──────────────────────┬──────────────────────────────────┘
                       │ /api/* rewrite
┌──────────────────────▼──────────────────────────────────┐
│                  Google Cloud Run                        │
│           FastAPI backend (4 vCPU / 4 GB RAM)           │
│    • /data/*         Trend & reference data             │
│    • /summary/*      TY/LY/NY performance               │
│    • /demand/*       Elasticity & simulation            │
│    • /optimise/*     Scenarios & constraints            │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│               Google Cloud Storage                       │
│         Pre-computed parquet files (~350 MB)             │
│  Forecasts · Elasticity · Opt results · Master dataset  │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TanStack Query, TanStack Table, Plotly.js, Tailwind CSS |
| Backend | FastAPI, Uvicorn, Pandas, PyArrow |
| Cloud | GCP Cloud Run, Firebase Hosting, Cloud Storage |
| Deployment | Cloud Build (`gcloud run deploy --source .`), Firebase CLI |
| Data | Walmart M5 Kaggle dataset (5.3 years, 30,444 SKU-stores) |

---

## ML Pipeline (proprietary — not included in this repo)

The frontend and API in this repo serve **pre-computed outputs** from a multi-stage ML pipeline. The pipeline itself is proprietary. At a high level it covers:

- **Price elasticity estimation** — 4-stage OLS hierarchy with credibility blending across 30,000+ SKU-store combinations. Handles sparse price variation, pricing family pooling, and benchmark fallbacks
- **Demand forecasting** — Two-stage seasonal index + LightGBM lift model. Industry-standard architecture (same pattern used at Walmart, Target, RELEX). 52-week forward forecast per SKU-store
- **Price optimisation** — Pyomo + IPOPT non-linear solver with a declarative constraint registry. Supports competitor price bounds, department margin floors, max price change limits, and volume loss restrictions. Efficient frontier across revenue ↔ profit trade-off (α parameter)
- **Data engineering** — Synthetic cost construction (margin-backed + diesel freight adjustment), IV instrument validation, demand pattern classification (smooth/erratic/lumpy/intermittent/sparse)

---

## Key Design Decisions

**Read-only app against pre-computed outputs.** The app never re-runs the ML pipeline. All parquet files are pre-built and served from Cloud Storage. This keeps the backend stateless and the Cloud Run container lightweight.

**Serverless architecture.** Cloud Run scales to zero when idle — zero cost at rest. Firebase Hosting serves the React build from a CDN globally.

**Per-page independent filters.** Each page maintains its own filter state. Filters persist across navigation but never bleed between pages. A "Clear Filters" button resets only the current page.

**Constrained optimisation with relaxation cascade.** When a price optimisation problem is infeasible (constraints conflict), the solver relaxes constraints in priority order: competitor bounds first, then margin floor, preserving the cost floor as a hard constraint always.

---

## Running Locally

```bash
# 1. Clone
git clone https://github.com/your-username/retail-price-intelligence-demo.git
cd retail-price-intelligence-demo

# 2. Backend (requires pre-computed data files — not included)
python -m venv env && source env/bin/activate
pip install -r requirements.txt
PYTHONPATH=src uvicorn src.app.main:app --reload --port 8000

# 3. Frontend
cd src/frontend
npm install
npm run dev  # http://localhost:3000
```

> **Note:** The backend requires pre-computed parquet files which are not included in this repo. The live demo at the link above is fully functional.

---

## Deployment

Deployed on GCP using Cloud Build (no local Docker required):

```bash
# Backend → Cloud Run
gcloud run deploy retail-price-api --source . --region us-central1

# Frontend → Firebase Hosting
cd src/frontend && npm run build && cd ../..
firebase deploy --only hosting
```

---

## Dataset

Built on the [Walmart M5 Forecasting](https://www.kaggle.com/competitions/m5-forecasting-accuracy) Kaggle dataset:
- 5.3 years of daily sales data (2011–2016)
- 3 US states (CA, TX, WI), 10 stores
- ~30,000 SKU-store combinations
- Product names masked in the public dataset

---

## Status

| Feature | Status |
|---|---|
| Trend Analysis | ✅ Live |
| Demand Lab | ✅ Live |
| Optimisation Studio | ✅ Live |
| Performance Summary | ✅ Live |
| Pipeline Engine APIs (re-run forecasting/optimisation) | 🔄 Phase 2 |
| AI Agent (natural language querying) | 🔄 Phase 3 |

---

*Built by Manoj Ponnachana · [LinkedIn](https://linkedin.com/in/your-profile)*
