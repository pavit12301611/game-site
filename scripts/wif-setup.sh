#!/usr/bin/env bash
#
# One-shot KEYLESS Workload Identity Federation setup.
#
# Lets the Vercel api/ functions reach Firestore + Auth with NO service-account key
# (works even when an org policy blocks key creation). It creates everything on GCP
# and prints the three env vars to paste into Vercel. Idempotent — safe to re-run.
#
# EASIEST: open Google Cloud Shell (https://shell.cloud.google.com) — gcloud and your
# project are already set up there — and run ONE line (all vars on the same line!):
#
#   TEAM_SLUG=your-team PROJECT_NAME=your-vercel-project \
#     bash <(curl -sL https://raw.githubusercontent.com/pavit12301611/psd-gaming/arena/8605cf19-psd-gaming/scripts/wif-setup.sh)
#
#   PROJECT_NAME  your Vercel PROJECT name (the site subdomain, e.g. "psd-gaming") —
#                 NOT your GCP project id.
#   TEAM_SLUG     your Vercel team slug — the name in your dashboard URL
#                 (vercel.com/<THIS>). For a personal account it is your username.
#   OIDC_ISSUER   optional alternative to TEAM_SLUG: paste the EXACT issuer URL shown at
#                 Vercel -> Project -> Settings -> OIDC Federation (use this if unsure of
#                 the slug, e.g. OIDC_ISSUER=https://oidc.vercel.com/acme).
#   PROJECT_ID    optional; defaults to `gcloud config get-value project`
#   SA_NAME       optional; defaults to psd-admin
#
# NOTE: a var on its own line is NOT passed to this script — keep them on the `bash` line.
#
set -euo pipefail

TEAM_SLUG="${TEAM_SLUG:-}"
OIDC_ISSUER="${OIDC_ISSUER:-}"
PROJECT_NAME="${PROJECT_NAME:-}"
SA_NAME="${SA_NAME:-psd-admin}"
POOL="vercel-pool"
PROVIDER="vercel-provider"

die() { echo "error: $*" >&2; exit 1; }
step() { printf '\033[1;36m•\033[0m %s\n' "$*"; }

# GCP needs a few seconds to propagate a brand-new service account before IAM will
# accept it in a binding, so retry IAM writes instead of failing on the race.
retry() {
  local tries="$1" delay="$2"; shift 2
  local n=1
  until "$@"; do
    if [ "$n" -ge "$tries" ]; then return 1; fi
    sleep "$delay"; n=$((n + 1))
  done
}

[ -n "$PROJECT_NAME" ] || die "set PROJECT_NAME (your Vercel project name), e.g. PROJECT_NAME=psd-gaming"

# The provider's issuer MUST exactly match the `iss` Vercel puts in its OIDC token. Either give
# the exact issuer (copy it from Vercel -> Settings -> OIDC Federation) or the team slug.
if [ -n "$OIDC_ISSUER" ]; then
  ISSUER="$OIDC_ISSUER"
elif [ -n "$TEAM_SLUG" ]; then
  ISSUER="https://oidc.vercel.com/$TEAM_SLUG"
else
  die "set TEAM_SLUG (e.g. TEAM_SLUG=acme) OR OIDC_ISSUER (the exact issuer URL from Vercel -> Settings -> OIDC Federation)"
fi

if [ -z "${PROJECT_ID:-}" ]; then
  PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
fi
[ -n "$PROJECT_ID" ] && [ "$PROJECT_ID" != "(unset)" ] || die "could not detect PROJECT_ID; set it explicitly"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo
echo "GCP project : $PROJECT_ID ($PROJECT_NUMBER)"
echo "Impersonate : $SA_EMAIL"
echo "Issuer      : $ISSUER"
echo "Trust from  : Vercel project '$PROJECT_NAME'"
echo

# 1. Service account to impersonate (never downloaded — only its email is used).
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  step "service account already exists"
else
  gcloud iam service-accounts create "$SA_NAME" \
    --project="$PROJECT_ID" --display-name="PSD gaming admin (keyless WIF)" >/dev/null
  step "created service account $SA_EMAIL"
  # A brand-new SA isn't usable in an IAM binding until it propagates; wait it out.
  for _ in $(seq 1 12); do
    gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1 && break
    sleep 5
  done
fi

# 2. The two roles the api routes need: Firestore, and Auth (delete users on account deletion).
retry 6 5 gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" --role="roles/datastore.user" >/dev/null
retry 6 5 gcloud projects add-iam-policy-binding "$PROJECT_ID" \
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
    --issuer-uri="$ISSUER" \
    --attribute-mapping="google.subject=assertion.sub,attribute.owner=assertion.owner,attribute.project=assertion.project" >/dev/null
  step "created OIDC provider trusting issuer $ISSUER"
fi

# 4. Let that Vercel project (any environment: Production AND Preview) impersonate the SA.
retry 6 5 gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
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
