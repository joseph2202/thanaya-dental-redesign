#!/usr/bin/env bash
# THANAYA isolated local preview. Runs ONLY with a disposable SQLite database.
# Does not modify backend/prisma/dev.db, real uploads, or your other checkout.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -f "$ROOT/backend/prisma/schema.prisma" || ! -f "$ROOT/frontend/package.json" ]]; then
  echo "ERROR: run from the Thanaya preview clone"; exit 1
fi
if [[ ! -d "$ROOT/.git" ]]; then
  echo "ERROR: this script expects a separate clone, not the live store workspace"; exit 1
fi
for port in 4108 3108; do
  if command -v lsof >/dev/null && lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "ERROR: localhost:$port is in use. Existing process was not touched."; exit 1
  fi
done
PREVIEW_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/thanaya-preview-XXXXXXXX")"
chmod 700 "$PREVIEW_ROOT"
BACK_PID=""
FRONT_PID=""
cleanup() {
  if [[ -n "$FRONT_PID" ]]; then kill "$FRONT_PID" 2>/dev/null || true; fi
  if [[ -n "$BACK_PID" ]]; then kill "$BACK_PID" 2>/dev/null || true; fi
  rm -rf -- "$PREVIEW_ROOT"
  echo ""
  echo "Preview stopped; its disposable SQLite and uploads were deleted."
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

export THANAYA_PREVIEW_ROOT="$PREVIEW_ROOT"
export THANAYA_PREVIEW_ONLY=1
export THANAYA_UPLOAD_DIR="$PREVIEW_ROOT/uploads"
export DATABASE_URL="file:$PREVIEW_ROOT/preview.sqlite"
export JWT_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export PORT=4108
export NODE_ENV=development
# Explicitly trust the *actual* preview frontend origins for cookie login + CSRF.
# No wildcard, public host or cross-origin credentials. Real store config is untouched.
export CORS_ALLOWED_ORIGINS=http://127.0.0.1:3108,http://localhost:3108
export THANAYA_INTERNAL_API_ORIGIN=http://127.0.0.1:4108
mkdir -p "$THANAYA_UPLOAD_DIR"

echo "Installing isolated preview dependencies (existing real store unchanged)..."
(cd "$ROOT/backend" && npm ci && npx prisma generate)
(cd "$ROOT/frontend" && npm ci)
echo "Creating a brand-new private SQLite database under $PREVIEW_ROOT..."
(cd "$ROOT/backend" && npx prisma db push --skip-generate && npm run build)
(cd "$ROOT/backend" && node scripts/seed_isolated_preview.cjs)

(cd "$ROOT/backend" && exec node dist/index.js) &
BACK_PID="$!"
echo "Backend preview started on localhost:4108"
for _ in {1..60}; do
  if ! kill -0 "$BACK_PID" 2>/dev/null; then echo "ERROR: backend preview exited"; exit 1; fi
  if curl --silent --fail --max-time 1 http://127.0.0.1:4108/api/health >/dev/null; then break; fi
  sleep 1
done
if ! curl --silent --fail --max-time 2 http://127.0.0.1:4108/api/health >/dev/null; then
  echo "ERROR: backend never became healthy"; exit 1
fi

(cd "$ROOT/frontend" && exec node node_modules/next/dist/bin/next dev -H 127.0.0.1 -p 3108) &
FRONT_PID="$!"
echo "Opening real Thanaya storefront at http://127.0.0.1:3108"
echo "Owner login: http://127.0.0.1:3108/login"
echo "Reports: http://127.0.0.1:3108/admin/reports"
echo "Supplier invoices: http://127.0.0.1:3108/admin/payables"
if command -v open >/dev/null 2>&1; then
  for _ in {1..60}; do
    if curl --silent --fail --max-time 1 http://127.0.0.1:3108/login >/dev/null; then
      open http://127.0.0.1:3108
      break
    fi
    if ! kill -0 "$FRONT_PID" 2>/dev/null; then echo "ERROR: frontend preview exited"; exit 1; fi
    sleep 1
  done
fi
echo "Press Ctrl+C to stop and clean up the temporary preview."
wait "$FRONT_PID"
