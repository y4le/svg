#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-4173}"
TAILNET_PATH="${TAILNET_PATH:-/svg}"
ROUTE_NAME="${ROUTE_NAME:-svg-workbench}"
VITE_BIN="${VITE_BIN:-$REPO_ROOT/node_modules/.bin/vite}"
TAILNET_HELPER=""
VITE_PID=""

fail() {
  echo "[dev:tailnet] $*" >&2
  exit 1
}

is_port() {
  [[ "$1" =~ ^[0-9]+$ ]] && ((10#$1 >= 1 && 10#$1 <= 65535))
}

resolve_tailnet_helper() {
  if [[ -n "${TAILNET_DEV_HOST_BIN:-}" ]]; then
    [[ -x "$TAILNET_DEV_HOST_BIN" ]] ||
      fail "TAILNET_DEV_HOST_BIN is not executable: $TAILNET_DEV_HOST_BIN"
    TAILNET_HELPER="$TAILNET_DEV_HOST_BIN"
    return
  fi

  if command -v tailnet-dev-host >/dev/null 2>&1; then
    TAILNET_HELPER="$(command -v tailnet-dev-host)"
    return
  fi

  local source_helper="/home/yale/dev/agents/agents/bin/tailnet-dev-host"
  [[ -x "$source_helper" ]] ||
    fail "tailnet-dev-host was not found; stow /home/yale/dev/agents or set TAILNET_DEV_HOST_BIN"
  TAILNET_HELPER="$source_helper"
}

reject_routing_overrides() {
  local argument
  for argument in "$@"; do
    case "$argument" in
      --host | --host=* | --port | --port=* | --base | --base=*)
        fail "use HOST, PORT, or TAILNET_PATH instead of passing $argument"
        ;;
    esac
  done
}

tailnet_url() {
  local url_json
  url_json="$("$TAILNET_HELPER" url --path "$TAILNET_PATH" --json)" || return 1

  TAILNET_URL_JSON="$url_json" node <<'NODE'
const payload = JSON.parse(process.env.TAILNET_URL_JSON ?? "{}");
if (typeof payload.url !== "string" || !payload.url.startsWith("https://")) process.exit(1);
process.stdout.write(payload.url);
NODE
}

wait_for_vite() {
  local attempt
  for ((attempt = 0; attempt < 100; attempt++)); do
    if ! kill -0 "$VITE_PID" 2>/dev/null; then
      set +e
      wait "$VITE_PID"
      local status=$?
      set -e
      fail "Vite exited before becoming ready (status $status)"
    fi
    if (exec 3<>"/dev/tcp/$HOST/$PORT") 2>/dev/null; then
      return
    fi
    sleep 0.05
  done
  fail "timed out waiting for Vite at http://$HOST:$PORT$TAILNET_PATH/"
}

cleanup_vite() {
  if [[ -n "$VITE_PID" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
    kill -TERM "$VITE_PID" 2>/dev/null || true
    wait "$VITE_PID" 2>/dev/null || true
  fi
}

is_port "$PORT" || fail "PORT must be an integer from 1 to 65535 (received $PORT)"
[[ "$HOST" == "127.0.0.1" || "$HOST" == "localhost" ]] ||
  fail "HOST must be 127.0.0.1 or localhost for tailnet-dev-host (received $HOST)"
[[ "$TAILNET_PATH" == /* && "$TAILNET_PATH" != "/" && "$TAILNET_PATH" != */ ]] ||
  fail "TAILNET_PATH must be a non-root path without a trailing slash (received $TAILNET_PATH)"
[[ -x "$VITE_BIN" ]] || fail "Vite is not installed; run npm install"
command -v node >/dev/null 2>&1 || fail "Node.js is required"

reject_routing_overrides "$@"
resolve_tailnet_helper

if (exec 3<>"/dev/tcp/$HOST/$PORT") 2>/dev/null; then
  fail "http://$HOST:$PORT/ is already in use; choose another PORT"
fi

"$TAILNET_HELPER" status ||
  fail "could not inspect Tailnet routes; check that Tailscale is installed, running, and logged in"
TAILNET_URL="$(tailnet_url)" ||
  fail "could not resolve a valid Tailnet URL; check that Tailscale is running and logged in"
TAILNET_HOST="${TAILNET_URL#https://}"
TAILNET_HOST="${TAILNET_HOST%%[:/]*}"
if [[ -n "${DEV_ALLOWED_HOSTS:-}" ]]; then
  export DEV_ALLOWED_HOSTS="${DEV_ALLOWED_HOSTS},${TAILNET_HOST}"
else
  export DEV_ALLOWED_HOSTS="$TAILNET_HOST"
fi
export SVG_TAILNET_PATH="$TAILNET_PATH"

echo "[dev:tailnet] starting Vite at http://$HOST:$PORT$TAILNET_PATH/"
"$VITE_BIN" "$@" \
  --host "$HOST" \
  --port "$PORT" \
  --strictPort \
  --clearScreen false &
VITE_PID="$!"

trap cleanup_vite EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

wait_for_vite
exposure_json="$(
  TAILNET_DEV_HOST_OWNER_PID="$$" "$TAILNET_HELPER" expose \
    --name "$ROUTE_NAME" \
    --repo "$REPO_ROOT" \
    --path "$TAILNET_PATH" \
    --port "$PORT" \
    --host "$HOST" \
    --json
)" || fail "Tailnet exposure failed; Vite will stop"

TAILNET_EXPOSURE_JSON="$exposure_json" node <<'NODE'
const payload = JSON.parse(process.env.TAILNET_EXPOSURE_JSON ?? "{}");
if (typeof payload.url !== "string") process.exit(1);
console.log(`[dev:tailnet] tailnet URL: ${payload.url}`);
NODE

echo "[dev:tailnet] the route persists after Vite stops; remove it with:"
printf "[dev:tailnet]   %q unexpose --name %q --repo %q --path %q\n" \
  "$TAILNET_HELPER" "$ROUTE_NAME" "$REPO_ROOT" "$TAILNET_PATH"

set +e
wait "$VITE_PID"
vite_status=$?
set -e
exit "$vite_status"
