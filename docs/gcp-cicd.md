# GitHub Actions → GCP Cloud Run

## What runs

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `CI` | PR + push to `main` | Frontend checks, Go tests (with Postgres), OpenAPI lint |
| `Deploy GCP` | push to `main` + manual dispatch | Build images, migrate, deploy API + web to Cloud Run |

## One-time GCP setup for Deploy

Create a deploy service account and download a JSON key (store only in GitHub Secrets):

```bash
PROJECT_ID=project-e18e387f-34bb-43fb-9db
SA_NAME=github-deploy
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "${SA_NAME}" \
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
    --condition=None \
    --quiet
done

gcloud iam service-accounts keys create ./github-deploy-key.json \
  --iam-account="${SA_EMAIL}" \
  --project="${PROJECT_ID}"
```

In the GitHub repo:

1. **Settings → Secrets and variables → Actions → Secrets**
   - `GCP_SA_KEY` = full contents of `github-deploy-key.json`
2. **Settings → Secrets and variables → Actions → Variables**
   - `GCP_PROJECT_ID` = `project-e18e387f-34bb-43fb-9db`
   - `GCP_REGION` = `asia-southeast1` (optional; this is the default)

Delete the local key file after uploading:

```bash
rm ./github-deploy-key.json
```

Prefer Workload Identity Federation later; the JSON key keeps the first setup short.

## Manual deploy

```bash
gh workflow run "Deploy GCP"
```

Or locally:

```bash
./scripts/gcp-deploy.sh
```
