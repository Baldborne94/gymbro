#!/usr/bin/env bash
# Test del container: build, avvio con docker compose, accesso, dati persistenti dopo un riavvio, backup.
# Usa cartelle temporanee e un nome di progetto separato: non tocca i dati veri.
# SKIP_BUILD=1 riusa l'immagine "gymbro" già costruita.
set -euo pipefail
cd "$(dirname "$0")/../.."

PORT="${SMOKE_PORT:-18080}"
TMP="$(mktemp -d)"
mkdir -p "$TMP/data" "$TMP/backups"
export GYMBRO_PASSWORD=smoke-test GYMBRO_PORT="$PORT" GYMBRO_DATA="$TMP/data" GYMBRO_BACKUPS="$TMP/backups"
COMPOSE=(docker compose -p gymbro-smoke --env-file /dev/null -f docker-compose.yml -f tests/docker/smoke.override.yml)
URL="http://127.0.0.1:$PORT"
JAR="$TMP/cookies"

cleanup() {
  "${COMPOSE[@]}" down --remove-orphans >/dev/null 2>&1 || true
  docker run --rm -v "$TMP:/t" alpine:3.20 rm -rf /t/data /t/backups >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

fail() { echo "ERRORE: $*" >&2; "${COMPOSE[@]}" logs --tail 50 >&2 || true; exit 1; }
step() { echo "▶ $*"; }

wait_healthy() {
  for _ in $(seq 1 60); do
    curl -fsS "$URL/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  fail "il container non risponde su $URL"
}

if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  step "avvio con l'immagine esistente"
  "${COMPOSE[@]}" up -d --no-build
else
  step "build e avvio"
  "${COMPOSE[@]}" up -d --build
fi
wait_healthy

step "l'app web viene servita"
curl -fsS "$URL/" | grep -q '<title>GymBro</title>' || fail "pagina principale mancante"
curl -fsS "$URL/manifest.webmanifest" | grep -q '"GymBro"' || fail "manifest mancante"
curl -fsS -o /dev/null "$URL/sw.js" || fail "service worker mancante"
curl -fsS "$URL/qualunque/pagina" | grep -q '<div id="root">' || fail "le pagine dell'app non tornano a index.html"

step "accesso"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/api/sync" -H 'content-type: application/json' -d '{}')
[[ "$code" == "401" ]] || fail "le API dovrebbero essere chiuse senza accesso (ricevuto $code)"
curl -fsS -c "$JAR" -X POST "$URL/api/login" -H 'content-type: application/json' -d '{"password":"smoke-test"}' >/dev/null || fail "accesso non riuscito"

step "scrittura di una sessione"
NOW=$(date +%s000)
curl -fsS -b "$JAR" -X POST "$URL/api/sync" -H 'content-type: application/json' -d "{\"since\":0,\"changes\":{\"workouts\":[{\"id\":\"smoke-w1\",\"updated_at\":$NOW,\"deleted\":false,\"routine_id\":null,\"day_id\":null,\"name\":\"Smoke\",\"date\":\"2026-11-20\",\"started_at\":1,\"finished_at\":2,\"notes\":\"\"}]}}" \
  | grep -q '"Smoke"' || fail "la sessione non è stata salvata"

step "i dati sopravvivono al riavvio del container"
"${COMPOSE[@]}" restart >/dev/null
wait_healthy
curl -fsS -c "$JAR" -X POST "$URL/api/login" -H 'content-type: application/json' -d '{"password":"smoke-test"}' >/dev/null
curl -fsS -b "$JAR" -X POST "$URL/api/sync" -H 'content-type: application/json' -d '{"since":0,"changes":{}}' \
  | grep -q '"smoke-w1"' || fail "dopo il riavvio la sessione è sparita"
[[ -f "$TMP/data/gymbro.db" ]] || fail "il database non è nella cartella montata"

step "backup nella cartella montata"
curl -fsS -b "$JAR" -X POST "$URL/api/backups" | grep -q '"name"' || fail "backup non riuscito"
ls "$TMP/backups/db/"gymbro-*.db >/dev/null 2>&1 || fail "nessun file di backup in $TMP/backups/db"

step "stato di salute secondo Docker"
for _ in $(seq 1 45); do
  state=$(docker inspect -f '{{.State.Health.Status}}' gymbro-smoke 2>/dev/null || echo none)
  [[ "$state" == "healthy" ]] && break
  sleep 2
done
[[ "$state" == "healthy" ]] || fail "healthcheck di Docker: $state"

echo "✔ container OK"
