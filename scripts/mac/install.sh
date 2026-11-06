#!/bin/bash
# VoroniX on this Mac without Docker: the CRM, its own database and VoroniX AI
# (whose memory is in the CRM's database). macOS itself (launchd) starts them at every login and
# keeps them running in the background, no browser tab needed.
# Needs Node.js 20+ (nodejs.org) and PostgreSQL (for example Postgres.app).
#
#   Install or update:
#     curl -fsSL https://raw.githubusercontent.com/Yernazar-KBTU/VoroniX/main/scripts/mac/install.sh | bash
#   Stop and remove (the data stays in ~/.voronix/pgdata):
#     curl -fsSL https://raw.githubusercontent.com/Yernazar-KBTU/VoroniX/main/scripts/mac/install.sh | bash -s -- --remove
#
#   CRM http://localhost:3000   VoroniX AI http://localhost:4000/live   Database localhost:5433
set -euo pipefail

VX="${VX_HOME:-$HOME/.voronix}"
APPS="$VX/apps"; BIN="$VX/bin"; RUN="$VX/run"; PGDATA="$VX/pgdata"
LOGS="${VX_LOGS:-$HOME/Library/Logs/VoroniX}"
AGENTS="$HOME/Library/LaunchAgents"
UIDN="$(id -u)"

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nОшибка: %s\n' "$*" >&2; exit 1; }

stop() {
  if [ -n "${VX_NO_LAUNCHD:-}" ]; then
    if [ -f "$RUN/$1.pid" ]; then kill "$(cat "$RUN/$1.pid")" 2>/dev/null || true; rm -f "$RUN/$1.pid"; sleep 1; fi
  else
    launchctl bootout "gui/$UIDN/dev.voronix.$1" 2>/dev/null || true
  fi
}

start() {
  if [ -n "${VX_NO_LAUNCHD:-}" ]; then
    nohup /bin/bash "$BIN/run-$1.sh" >>"$LOGS/$1.log" 2>&1 &
    echo $! >"$RUN/$1.pid"
    return
  fi
  mkdir -p "$AGENTS"
  cat >"$AGENTS/dev.voronix.$1.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>dev.voronix.$1</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$BIN/run-$1.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>ExitTimeOut</key><integer>60</integer>
  <key>StandardOutPath</key><string>$LOGS/$1.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$1.log</string>
</dict></plist>
EOF
  launchctl bootstrap "gui/$UIDN" "$AGENTS/dev.voronix.$1.plist"
}

wait_for() { # name url seconds
  local i=0
  until curl -fsS -o /dev/null "$2" 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -gt "$3" ]; then tail -n 30 "$LOGS/$1.log" >&2 || true; die "$1 не запустился, журнал: $LOGS/$1.log"; fi
    sleep 1
  done
}

if [ "${1:-}" = "--remove" ]; then
  for s in ai data crm db; do stop "$s"; rm -f "$AGENTS/dev.voronix.$s.plist"; done
  echo "VoroniX остановлен и убран из автозапуска. Данные остались в $PGDATA"
  exit 0
fi

# --- What is needed on this Mac
NODE="$(command -v node || true)"
for d in /usr/local/bin /opt/homebrew/bin; do [ -z "$NODE" ] && [ -x "$d/node" ] && NODE="$d/node"; done
[ -n "$NODE" ] || die "не найден Node.js. Установите LTS-версию с https://nodejs.org и запустите команду снова."
export PATH="$(dirname "$NODE"):$PATH"
[ "$("$NODE" -p 'process.versions.node.split(".")[0]')" -ge 20 ] || die "нужен Node.js 20 или новее, сейчас $("$NODE" -v)."

mkdir -p "$APPS" "$BIN" "$RUN" "$LOGS"; chmod 700 "$VX"
SETTINGS="$VX/settings"
[ -f "$SETTINGS" ] && . "$SETTINGS"
rand() { od -An -tx1 -N16 /dev/urandom | tr -d ' \n'; }
DB_PASSWORD="${DB_PASSWORD:-$(rand)}"
VORONIX_AI_KEY="${VORONIX_AI_KEY:-$(rand)}"
INTEGRATION_ENCRYPTION_KEY="${INTEGRATION_ENCRYPTION_KEY:-$(rand)$(rand)}"

if [ -z "${PG_BIN:-}" ] || [ ! -x "$PG_BIN/postgres" ]; then
  PG_BIN=""
  for c in "${VX_PG_BIN:-}" "$(dirname "$(command -v initdb 2>/dev/null || echo /none/initdb)")" \
    /Applications/Postgres.app/Contents/Versions/latest/bin /opt/homebrew/opt/postgresql@17/bin \
    /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@17/bin /usr/local/opt/postgresql@16/bin \
    /Library/PostgreSQL/*/bin /usr/lib/postgresql/*/bin; do
    if [ -n "$c" ] && [ -x "$c/initdb" ] && [ -x "$c/postgres" ]; then PG_BIN="$(cd "$c" && pwd -P)"; break; fi
  done
  [ -n "$PG_BIN" ] || die "не найден PostgreSQL. Установите Postgres.app (https://postgresapp.com) и запустите команду снова."
fi
umask 077
printf 'DB_PASSWORD=%s\nVORONIX_AI_KEY=%s\nINTEGRATION_ENCRYPTION_KEY=%s\nPG_BIN=%s\n' "$DB_PASSWORD" "$VORONIX_AI_KEY" "$INTEGRATION_ENCRYPTION_KEY" "'$PG_BIN'" >"$SETTINGS"
umask 022

# --- Our own database (port 5433, only this computer)
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  say "Создаю базу данных"
  pw="$(mktemp)"; printf '%s\n' "$DB_PASSWORD" >"$pw"
  "$PG_BIN/initdb" -D "$PGDATA" -U crm --pwfile="$pw" --auth=scram-sha-256 -E UTF8 >/dev/null
  rm -f "$pw"
fi
cat >"$BIN/run-db.sh" <<EOF
#!/bin/bash
exec "$PG_BIN/postgres" -D "$PGDATA" -p 5433 -c listen_addresses=localhost -k "$RUN"
EOF
stop db; start db
for i in $(seq 1 60); do "$PG_BIN/pg_isready" -q -h localhost -p 5433 && break; sleep 1; done
"$PG_BIN/pg_isready" -q -h localhost -p 5433 || die "база не запустилась, журнал: $LOGS/db.log"
export PGPASSWORD="$DB_PASSWORD"
if [ -z "$("$PG_BIN/psql" -h localhost -p 5433 -U crm -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='crm'")" ]; then
  "$PG_BIN/psql" -h localhost -p 5433 -U crm -d postgres -qc "CREATE DATABASE crm"
fi
unset PGPASSWORD
DB="postgresql://crm:$DB_PASSWORD@localhost:5433/crm"

# --- Download and build the newest versions from GitHub
fetch() { # repo name
  rm -rf "$APPS/$2.new"; mkdir -p "$APPS/$2.new"
  curl -fsSL "https://codeload.github.com/$1/tar.gz/refs/heads/main" | tar -xz -C "$APPS/$2.new" --strip-components=1
}
npmi() { npm ci --no-audit --no-fund --loglevel=error; }
say "Скачиваю и собираю CRM"
fetch Yernazar-KBTU/VoroniX crm
(cd "$APPS/crm.new" && npmi && npm run build >/dev/null)
say "Скачиваю и собираю VoroniX AI"
fetch Yernazar-KBTU/VoroniX-AI ai
(cd "$APPS/ai.new" && npmi && npm run build >/dev/null && npm run build:demo >/dev/null)

say "Запускаю"
# "data" was the separate data server of earlier versions: stopped and removed.
for s in ai data crm; do stop "$s"; done
rm -f "$AGENTS/dev.voronix.data.plist"
rm -rf "$APPS/data" "$BIN/run-data.sh"
for s in crm ai; do
  rm -rf "$APPS/$s.old"; [ -d "$APPS/$s" ] && mv "$APPS/$s" "$APPS/$s.old"
  mv "$APPS/$s.new" "$APPS/$s"; rm -rf "$APPS/$s.old"
done

umask 077
cat >"$BIN/run-crm.sh" <<EOF
#!/bin/bash
cd "$APPS/crm"
export PORT=3000 DATABASE_URL="$DB" APP_URL=http://localhost:3000 ALLOW_DEMO_RESET=true \\
  INTEGRATION_ENCRYPTION_KEY="$INTEGRATION_ENCRYPTION_KEY" \\
  VORONIX_AI_URL=http://localhost:4000 VORONIX_AI_KEY="$VORONIX_AI_KEY" VORONIX_AI_PUBLIC_URL=http://localhost:4000
exec "$NODE" apps/api/dist/server.js
EOF
cat >"$BIN/run-ai.sh" <<EOF
#!/bin/bash
until curl -fsS -o /dev/null http://localhost:3000/api/health; do sleep 2; done
cd "$APPS/ai"
export PORT=4000 DATA_URL=http://localhost:3000/ai-data VORONIX_AI_KEY="$VORONIX_AI_KEY"
exec "$NODE" dist/server.js
EOF
umask 022
for s in crm ai; do start "$s"; done
wait_for crm http://localhost:3000/api/health 180
wait_for ai http://localhost:4000/health 120

cat <<EOF

Готово. VoroniX работает в фоне и сам запускается при входе в систему.
  CRM:         http://localhost:3000  (зарегистрируйтесь, затем Интеграции, Telegram)
  VoroniX AI:  http://localhost:4000/live  (или значок ИИ в CRM)
  Журналы:     $LOGS
Обновить: запустите эту же команду ещё раз.
EOF
