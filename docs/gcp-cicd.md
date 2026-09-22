# GitHub Actions → GCP Cloud Run

## What runs

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `CI` | PR + push to `main` | Frontend checks, Go tests (with Postgres), OpenAPI lint |
| `Deploy GCP` | after CI succeeds on `main`, or manual dispatch | Build images, migrate, deploy API + web to Cloud Run |

## Auth model

This repo uses **Workload Identity Federation** (no JSON service-account keys). The org policy `iam.disableServiceAccountKeyCreation` blocks key download, so WIF is required.

Configured GitHub Actions variables:

| Variable | Example |
| --- | --- |
| `GCP_PROJECT_ID` | `project-e18e387f-34bb-43fb-9db` |
| `GCP_REGION` | `asia-southeast1` |
| `GCP_SERVICE_ACCOUNT` | `github-deploy@…iam.gserviceaccount.com` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/…/workloadIdentityPools/github-actions/providers/github` |

## One-time GCP setup (already done for this project)

```bash
PROJECT_ID=project-e18e387f-34bb-43fb-9db
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
SA_EMAIL="github-deploy@${PROJECT_ID}.iam.gserviceaccount.com"
REPO="besterdev/cal-food-store-full-stack"
POOL_ID=github-actions
PROVIDER_ID=github

gcloud iam service-accounts create github-deploy \
  --display-name="GitHub Actions deploy" \
  --project="${PROJECT_ID}"

for ROLE in \
  roles/run.admin \
  roles/iam.serviceAccountUser \
  roles/cloudbuild.builds.editor \
  roles/artifactregistry.writer \
  roles/secretmanager.admin \
  roles/cloudsql.admin \
  roles/storage.admin
do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${ROLE}" \
    --condition=None --quiet
done

gcloud iam workload-identity-pools create "${POOL_ID}" \
  --location=global \
  --display-name="GitHub Actions" \
  --project="${PROJECT_ID}"

gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
  --location=global \
  --workload-identity-pool="${POOL_ID}" \
  --display-name="GitHub" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository=='${REPO}'" \
  --project="${PROJECT_ID}"

gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPO}"

gh variable set GCP_PROJECT_ID --body "${PROJECT_ID}"
gh variable set GCP_REGION --body "asia-southeast1"
gh variable set GCP_SERVICE_ACCOUNT --body "${SA_EMAIL}"
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER \
  --body "projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"
```

## Manual deploy

```bash
gh workflow run "Deploy GCP"
```

Or locally (uses your user credentials):

```bash
./scripts/gcp-deploy.sh
```
