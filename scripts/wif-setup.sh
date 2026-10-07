#!/usr/bin/env bash
#
# One-shot KEYLESS Workload Identity Federation setup.
#
# Lets the Vercel api/ functions reach Firestore + Auth with NO service-account key
# (works even when an org policy blocks key creation). It creates everything on GCP
# and prints the three env vars to paste into Vercel. Idempotent — safe to re-run.
#
# EASIEST: open Google Cloud Shell (https://shell.cloud.google.com) — gcloud and your
# project are already set up there — and run:
#
#   TEAM_SLUG=your-team PROJECT_NAME=your-vercel-project \
#     bash <(curl -sL https://raw.githubusercontent.com/pavit12301611/psd-gaming/arena/8605cf19-psd-gaming/scripts/wif-setup.sh)
#
#   TEAM_SLUG     your Vercel team slug (dashboard URL / Settings -> OIDC Federation)
#   PROJECT_NAME  your Vercel PROJECT name (the site subdomain, e.g. "psd-gaming") —
#                 NOT your GCP project id.
#   PROJECT_ID    optional; defaults to `gcloud config get-value project`
#   SA_NAME       optional; defaults to psd-admin
#
set -euo pipefail

TEAM_SLUG="${TEAM_SLUG:-}"
PROJECT_NAME="${PROJECT_NAME:-}"
SA_NAME="${SA_NAME:-psd-admin}"
POOL="vercel-pool"
PROVIDER="vercel-provider"

die() { echo "error: $*" >&2; exit 1; }
step() { printf '\033[1;36m•\033[0m %s\n' "$*"; }

[ -n "$TEAM_SLUG" ] || die "set TEAM_SLUG (your Vercel team slug), e.g. TEAM_SLUG=acme"
[ -n "$PROJECT_NAME" ] || die "set PROJECT_NAME (your Vercel project name), e.g. PROJECT_NAME=psd-gaming"

if [ -z "${PROJECT_ID:-}" ]; then
  PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
fi
[ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "(unset)" ] || die "could not detect PROJECT_ID; set it explicitly"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo
echo "GCP project : $PROJECT_ID ($PROJECT_NUMBER)"
echo "Impersonate : $SA_EMAIL"
echo "Trust from  : Vercel project '$PROJECT_NAME' (team '$TEAM_SLUG')"
echo

# 1. Service account to impersonate (never downloaded — only its email is used).
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  step "service account already exists"
else
  gcloud iam service-accounts create "$SA_NAME" \
    --project="$PROJECT_ID" --display-name="PSD gaming admin (keyless WIF)" >/dev/null
  step "created service account $SA_EMAIL"
fi

# 2. The two roles the api routes need: Firestore, and Auth (delete users on account deletion).
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" --role="roles/datastore.user" >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" --role="roles/identitytoolkit.admin" >/dev/null
step "granted roles/datastore.user + roles/identitytoolkit.admin"

# 3. Workload Identity Pool + OIDC provider that trusts Vercel's tokens.
gcloud iam workload-identity-pools create "$POOL" \
  --project="$PROJECT_ID" --location="global" >/dev/null 2>&1 || step "pool already exists"
if gcloud iam workload-identity-pools providers describe "$PROVIDER" \
    --location="global" --workload-identity-pool="$POOL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  step "provider already exists"
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --project="$PROJECT_ID" --location="global" --workload-identity-pool="$POOL" \
    --issuer-uri="https://oidc.vercel.com/$TEAM_SLUG" \
    --attribute-mapping="google.subject=assertion.sub,attribute.owner=assertion.owner,attribute.project=assertion.project" \
    --allowed-audiences="https://vercel.com/$TEAM_SLUG" >/dev/null
  step "created OIDC provider trusting Vercel team '$TEAM_SLUG'"
fi

# 4. Let that Vercel project (any environment: Production AND Preview) impersonate the SA.
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" --role="roles/iam.serviceAccountTokenCreator" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.project/$PROJECT_NAME" >/dev/null
step "bound Vercel project '$PROJECT_NAME' to the service account"

AUDIENCE="$(gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --location="global" --workload-identity-pool="$POOL" --project="$PROJECT_ID" --format='value(name)')"

cat <<EOF

$(printf '\033[1;32m')Done.$(printf '\033[0m') Now paste these into
   Vercel -> your project -> Settings -> Environment Variables
   (enable each for Production AND Preview), then REDEPLOY:

FIREBASE_WIF_AUDIENCE=$AUDIENCE
FIREBASE_WIF_SERVICE_ACCOUNT=$SA_EMAIL
FIREBASE_PROJECT_ID=$PROJECT_ID

If OIDC Federation is not already on: Vercel -> Project -> Settings -> OIDC Federation -> Enable.
Verify by playing online / creating a room: it should succeed over /api/*.
EOF
