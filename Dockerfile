# ── Stage 1: Python backend ───────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (needed for pyarrow, pandas)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY src/ ./src/

# Use production config
RUN cp /app/src/config/app_config.production.yaml /app/src/config/app_config.yaml


# Cloud Run sets PORT env var — default to 8080
ENV PORT=8080
ENV PYTHONPATH=/app/src

EXPOSE 8080

CMD ["uvicorn", "src.app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8080", \
     "--workers", "2", \
     "--timeout-keep-alive", "75"]
