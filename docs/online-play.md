# Online Play Architecture

## Overview

Every online mutation runs through the serverless backend (`api/`). The browser calls `/api/*` routes with a Firebase ID token. The backend validates identity, membership, room status, turn order, legal moves and rate limits before writing.

## Deploy Runbook

1. Create a Firebase project and Web app
2. Enable Anonymous, Email/Password and Google sign-in
3. Create Firestore and publish `firestore.rules`
4. Add `VITE_FIREBASE_*` variables in Vercel
5. Add `FIREBASE_SERVICE_ACCOUNT` in Vercel
6. Redeploy

## Billing

The free Spark plan supports 20,000 writes/day. A visible member writes ~144 heartbeats/hour.