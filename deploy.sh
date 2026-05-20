#!/bin/bash
# =============================================================================
# deploy.sh — Full deployment script for Retail Price Intelligence Engine
# Run from project root: "Walmart Sales/"
# =============================================================================

set -e  # Exit on any error
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"

PROJECT_ID="sample-project-v1-495106"
REGION="us-central1"
SERVICE_NAME="your-app-api"
BUCKET_NAME="your-app-poc"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "============================================================"
echo "  Retail Price Intelligence Engine — Production Deployment"
echo "============================================================"

# ── Step 1: Set project ───────────────────────────────────────
echo ""
echo "Step 1: Setting GCP project..."
gcloud config set project ${PROJECT_ID}

# ── Step 2: GCS bucket & data ─────────────────────────────────
echo ""
echo "Step 2: Verifying Cloud Storage bucket..."
gcloud storage buckets create gs://${BUCKET_NAME} \
  --location=${REGION} \
  --uniform-bucket-level-access 2>/dev/null || echo "  Bucket already exists, skipping."

echo "  Data files already uploaded to GCS — skipping upload step."
echo "  (To re-upload data, uncomment the gsutil cp commands below)"
# gsutil cp "data/reporting/master_price_performance_seasonal.parquet" gs://${BUCKET_NAME}/data/reporting/
# gsutil cp "data/reporting/ty_ly_ny_summary.parquet"                  gs://${BUCKET_NAME}/data/reporting/
# ... add other files as needed

# ── Step 3 & 4: Build and Deploy to Cloud Run via Cloud Build ─────────
echo ""
echo "Step 3 & 4: Deploying backend directly to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --source . \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --memory 4Gi \
  --cpu 4 \
  --min-instances 1 \
  --max-instances 3 \
  --concurrency 80 \
  --timeout 300 \
  --set-env-vars APP_ENV=production \
  --set-env-vars PROJECT_ROOT=/app

BACKEND_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region ${REGION} --format "value(status.url)")
echo "  Backend deployed: ${BACKEND_URL}"

# ── Step 5: Build React frontend ─────────────────────────────
echo ""
echo "Step 5: Building React frontend..."
cd src/frontend
npm ci
npm run build
cd ../..
echo "  Frontend build complete."

# ── Step 6: Deploy to Firebase Hosting ───────────────────────
echo ""
echo "Step 6: Deploying frontend to Firebase Hosting..."
firebase deploy --only hosting

FRONTEND_URL="https://${PROJECT_ID}.web.app"

echo ""
echo "============================================================"
echo "  DEPLOYMENT COMPLETE"
echo "============================================================"
echo "  Frontend (share this):  ${FRONTEND_URL}"
echo "  Backend root:           ${BACKEND_URL}"
echo "  Backend health check:   ${BACKEND_URL}/api/health"
echo "  Backend departments:    ${BACKEND_URL}/api/data/departments"
echo ""
echo "  NOTE: The bare backend URL showing a JSON status page is"
echo "  correct. The frontend calls /api/* routes automatically."
echo "============================================================"
