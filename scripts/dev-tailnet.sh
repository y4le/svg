#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-4173}"
TAILNET_HTTPS_PORT="${TAILNET_HTTPS_PORT:-4443}"
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
  if [[ -x "$source_helper" ]]; then
    TAILNET_HELPER="$source_helper"
    return
  fi

  fail "tailnet-dev-host was not found; stow /home/yale/dev/agents or set TAILNET_DEV_HOST_BIN"
}

reject_routing_overrides() {
  local argument

  for argument in "$@"; do
    case "$argument" in
      --host | --host=* | --port | --port=* | --base | --base=*)
        fail "use HOST, PORT, or TAILNET_HTTPS_PORT instead of passing $argument"
        ;;
    esac
  done
}

check_route_owner() {
  local status_json

  status_json="$("$TAILNET_HELPER" status --json)" ||
    fail "could not inspect Tailnet routes; check that Tailscale is installed, running, and logged in"

  ROUTE_STATUS_JSON="$status_json" \
    ROUTE_HTTPS_PORT="$TAILNET_HTTPS_PORT" \
    ROUTE_NAME="$ROUTE_NAME" \
    ROUTE_REPO="$REPO_ROOT" \
    node <<'NODE'
let payload;
try {
  payload = JSON.parse(process.env.ROUTE_STATUS_JSON ?? "");
} catch {
  console.error("[dev:tailnet] tailnet-dev-host status returned invalid JSON; refusing root exposure");
  process.exit(1);
}
if (!Array.isArray(payload.routes)) {
  console.error("[dev:tailnet] tailnet-dev-host status omitted its routes array; refusing root exposure");
  process.exit(1);
}

const httpsPort = Number(process.env.ROUTE_HTTPS_PORT);
const route = payload.routes.find(
  (candidate) =>
    candidate.live === true &&
    candidate.https_port === httpsPort &&
    candidate.path === "/",
);

if (!route) process.exit(0);

if (
  route.name === process.env.ROUTE_NAME &&
  route.repo === process.env.ROUTE_REPO
) {
  console.log(`[dev:tailnet] updating owned route ${route.target ?? "(unknown target)"}`);
  process.exit(0);
}

console.error(
  `[dev:tailnet] refusing to replace https:${httpsPort} / owned by ${route.name ?? "unknown"} ` +
    `(${route.repo ?? "unknown repo"}) -> ${route.target ?? "non-proxy handler"}; ` +
    "choose another TAILNET_HTTPS_PORT",
);
process.exit(1);
NODE
}

tailnet_url() {
  local url_json

  url_json="$("$TAILNET_HELPER" url --path / --https-port "$TAILNET_HTTPS_PORT" --json)" ||
    return 1

  TAILNET_URL_JSON="$url_json" node <<'NODE'
const payload = JSON.parse(process.env.TAILNET_URL_JSON ?? "{}");
if (typeof payload.url !== "string" || !payload.url.startsWith("https://")) process.exit(1);
process.stdout.write(payload.url);
NODE
}

wait_for_vite() {
  local _

  for _ in {1..100}; do
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

  kill -TERM "$VITE_PID" 2>/dev/null || true
  wait "$VITE_PID" 2>/dev/null || true
  fail "timed out waiting for Vite at http://$HOST:$PORT/"
}

cleanup_vite() {
  if [[ -n "$VITE_PID" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
    kill -TERM "$VITE_PID" 2>/dev/null || true
    wait "$VITE_PID" 2>/dev/null || true
  fi
}

is_port "$PORT" || fail "PORT must be an integer from 1 to 65535 (received $PORT)"
is_port "$TAILNET_HTTPS_PORT" ||
  fail "TAILNET_HTTPS_PORT must be an integer from 1 to 65535 (received $TAILNET_HTTPS_PORT)"
[[ "$HOST" == "127.0.0.1" || "$HOST" == "localhost" ]] ||
  fail "HOST must be 127.0.0.1 or localhost for tailnet-dev-host (received $HOST)"
[[ -x "$VITE_BIN" ]] || fail "Vite is not installed; run npm install"
command -v node >/dev/null 2>&1 || fail "Node.js is required"

reject_routing_overrides "$@"
resolve_tailnet_helper
check_route_owner

if (exec 3<>"/dev/tcp/$HOST/$PORT") 2>/dev/null; then
  fail "http://$HOST:$PORT/ is already in use; choose another PORT"
fi

TAILNET_URL="$(tailnet_url)" ||
  fail "could not resolve a valid Tailnet URL; check that Tailscale is running and logged in"
TAILNET_HOST="${TAILNET_URL#https://}"
TAILNET_HOST="${TAILNET_HOST%%[:/]*}"
if [[ -n "${DEV_ALLOWED_HOSTS:-}" ]]; then
  export DEV_ALLOWED_HOSTS="${DEV_ALLOWED_HOSTS},${TAILNET_HOST}"
else
  export DEV_ALLOWED_HOSTS="$TAILNET_HOST"
fi

echo "[dev:tailnet] starting Vite at http://$HOST:$PORT/"
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
# Recheck immediately before the root-only force call. The helper currently
# couples root permission to --force, so this project-side guard is required.
check_route_owner

exposure_json="$(
  TAILNET_DEV_HOST_OWNER_PID="$$" "$TAILNET_HELPER" expose \
    --name "$ROUTE_NAME" \
    --repo "$REPO_ROOT" \
    --path / \
    --port "$PORT" \
    --host "$HOST" \
    --https-port "$TAILNET_HTTPS_PORT" \
    --force \
    --allow-root \
    --json
)" || {
  kill -TERM "$VITE_PID" 2>/dev/null || true
  wait "$VITE_PID" 2>/dev/null || true
  fail "Tailnet exposure failed; Vite was stopped"
}

TAILNET_EXPOSURE_JSON="$exposure_json" node <<'NODE'
const payload = JSON.parse(process.env.TAILNET_EXPOSURE_JSON ?? "{}");
if (typeof payload.url !== "string") {
  console.error("[dev:tailnet] tailnet-dev-host expose returned no URL; Vite will stop");
  process.exit(1);
}
console.log(`[dev:tailnet] tailnet URL: ${payload.url}`);
NODE

echo "[dev:tailnet] the route persists after Vite stops; remove it with:"
printf "[dev:tailnet]   %q unexpose --name %q --repo %q --path / --https-port %q --force --allow-root\n" \
  "$TAILNET_HELPER" "$ROUTE_NAME" "$REPO_ROOT" "$TAILNET_HTTPS_PORT"

set +e
wait "$VITE_PID"
vite_status=$?
set -e

cleanup_vite
exit "$vite_status"
