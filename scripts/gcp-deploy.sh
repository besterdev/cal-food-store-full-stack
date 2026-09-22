#!/usr/bin/env bash
# Deploy Food Store Calculator to GCP Cloud Run + Cloud SQL.
# Usage: ./scripts/gcp-deploy.sh
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-asia-southeast1}"
REPO="${ARTIFACT_REPO:-food-store}"
SQL_INSTANCE="${SQL_INSTANCE:-food-store-pg}"
DB_NAME="${DB_NAME:-food_store}"
DB_USER="${DB_USER:-food_store}"
API_SERVICE="${API_SERVICE:-food-store-api}"
WEB_SERVICE="${WEB_SERVICE:-food-store-web}"
MIGRATE_JOB="${MIGRATE_JOB:-food-store-migrate}"
DB_URL_SECRET="${DB_URL_SECRET:-food-store-database-url}"

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "Set GCP_PROJECT_ID or gcloud config set project ..." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}"
CONNECTION_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
GIT_SHA="$(git -C "${ROOT}" rev-parse --short HEAD)"
API_IMAGE="${IMAGE_BASE}/api:${GIT_SHA}"
WEB_IMAGE="${IMAGE_BASE}/web:${GIT_SHA}"

echo "==> Project ${PROJECT_ID} region ${REGION}"

gcloud config set project "${PROJECT_ID}" >/dev/null
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  compute.googleapis.com \
  iam.googleapis.com \
  --project="${PROJECT_ID}"

if ! gcloud artifacts repositories describe "${REPO}" --location="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "==> Creating Artifact Registry ${REPO}"
  gcloud artifacts repositories create "${REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Food Store Calculator images" \
    --project="${PROJECT_ID}"
fi

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

if ! gcloud sql instances describe "${SQL_INSTANCE}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  BOOTSTRAP_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
  echo "==> Creating Cloud SQL instance ${SQL_INSTANCE} (several minutes)"
  gcloud sql instances create "${SQL_INSTANCE}" \
    --database-version=POSTGRES_17 \
    --edition=ENTERPRISE \
    --tier=db-f1-micro \
    --region="${REGION}" \
    --storage-size=10GB \
    --storage-auto-increase \
    --root-password="${BOOTSTRAP_PASSWORD}" \
    --project="${PROJECT_ID}" \
    --quiet
fi

if ! gcloud sql databases describe "${DB_NAME}" --instance="${SQL_INSTANCE}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud sql databases create "${DB_NAME}" --instance="${SQL_INSTANCE}" --project="${PROJECT_ID}"
fi

if gcloud secrets describe "${DB_URL_SECRET}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "==> Reusing existing secret ${DB_URL_SECRET}"
else
  DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
  if gcloud sql users list --instance="${SQL_INSTANCE}" --project="${PROJECT_ID}" --format='value(name)' | grep -qx "${DB_USER}"; then
    gcloud sql users set-password "${DB_USER}" \
      --instance="${SQL_INSTANCE}" \
      --password="${DB_PASSWORD}" \
      --project="${PROJECT_ID}" >/dev/null
  else
    gcloud sql users create "${DB_USER}" \
      --instance="${SQL_INSTANCE}" \
      --password="${DB_PASSWORD}" \
      --project="${PROJECT_ID}"
  fi

  DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${CONNECTION_NAME}&sslmode=disable"
  printf '%s' "${DATABASE_URL}" | gcloud secrets create "${DB_URL_SECRET}" \
    --data-file=- \
    --replication-policy=automatic \
    --project="${PROJECT_ID}"
fi

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/cloudsql.client" \
  --condition=None \
  --quiet >/dev/null || true

gcloud secrets add-iam-policy-binding "${DB_URL_SECRET}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="${PROJECT_ID}" \
  --quiet >/dev/null || true

EXISTING_WEB_URL="$(gcloud run services describe "${WEB_SERVICE}" --region="${REGION}" --project="${PROJECT_ID}" --format='value(status.url)' 2>/dev/null || true)"
INITIAL_CORS="${EXISTING_WEB_URL:-http://localhost:3000}"

echo "==> Building API image ${API_IMAGE}"
gcloud builds submit "${ROOT}/api" \
  --tag="${API_IMAGE}" \
  --project="${PROJECT_ID}" \
  --quiet

echo "==> Deploying API"
gcloud run deploy "${API_SERVICE}" \
  --image="${API_IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=0 \
  --max-instances=5 \
  --timeout=60 \
  --set-cloudsql-instances="${CONNECTION_NAME}" \
  --set-env-vars="API_ADDRESS=:8080,CORS_ALLOWED_ORIGINS=${INITIAL_CORS}" \
  --set-secrets="DATABASE_URL=${DB_URL_SECRET}:latest" \
  --project="${PROJECT_ID}" \
  --quiet

API_URL="$(gcloud run services describe "${API_SERVICE}" --region="${REGION}" --project="${PROJECT_ID}" --format='value(status.url)')"
echo "==> API URL: ${API_URL}"

echo "==> Ensuring migrate job"
if gcloud run jobs describe "${MIGRATE_JOB}" --region="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud run jobs update "${MIGRATE_JOB}" \
    --image="${API_IMAGE}" \
    --region="${REGION}" \
    --command=/usr/local/bin/migrate \
    --set-cloudsql-instances="${CONNECTION_NAME}" \
    --set-secrets="DATABASE_URL=${DB_URL_SECRET}:latest" \
    --project="${PROJECT_ID}" \
    --quiet
else
  gcloud run jobs create "${MIGRATE_JOB}" \
    --image="${API_IMAGE}" \
    --region="${REGION}" \
    --command=/usr/local/bin/migrate \
    --set-cloudsql-instances="${CONNECTION_NAME}" \
    --set-secrets="DATABASE_URL=${DB_URL_SECRET}:latest" \
    --max-retries=1 \
    --task-timeout=120 \
    --project="${PROJECT_ID}" \
    --quiet
fi

echo "==> Running migrations"
gcloud run jobs execute "${MIGRATE_JOB}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --wait

WEB_BUILD_CONFIG="$(mktemp)"
cat >"${WEB_BUILD_CONFIG}" <<EOF
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - --build-arg=NEXT_PUBLIC_API_BASE_URL=${API_URL}
      - -t
      - ${WEB_IMAGE}
      - .
images:
  - ${WEB_IMAGE}
EOF

echo "==> Building web image ${WEB_IMAGE}"
gcloud builds submit "${ROOT}/web" \
  --config="${WEB_BUILD_CONFIG}" \
  --project="${PROJECT_ID}" \
  --quiet
rm -f "${WEB_BUILD_CONFIG}"

echo "==> Deploying web"
gcloud run deploy "${WEB_SERVICE}" \
  --image="${WEB_IMAGE}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=3000 \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=0 \
  --max-instances=5 \
  --project="${PROJECT_ID}" \
  --quiet

WEB_URL="$(gcloud run services describe "${WEB_SERVICE}" --region="${REGION}" --project="${PROJECT_ID}" --format='value(status.url)')"
echo "==> Web URL: ${WEB_URL}"

echo "==> Updating API CORS"
gcloud run services update "${API_SERVICE}" \
  --region="${REGION}" \
  --update-env-vars="CORS_ALLOWED_ORIGINS=${WEB_URL}" \
  --project="${PROJECT_ID}" \
  --quiet

cat <<EOF

Deployed:
  Web: ${WEB_URL}
  API: ${API_URL}
  Products: ${API_URL}/api/v1/products
  Ready: ${API_URL}/health/ready
EOF
