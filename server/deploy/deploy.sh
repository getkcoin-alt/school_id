#!/usr/bin/env bash
# Runs on the production server (called by the GitLab pipeline).
# Installs a new release next to the old one, switches port 6001 to it and
# rolls back automatically if the health check fails.
set -euo pipefail

BASE=/mnt/vol1/Project/Backend-v2
RELEASE="$1"                                   # e.g. $BASE/releases/20261111-120000
SHARED="$BASE/shared"
ENV_FILE="$SHARED/.env"
NODE_VERSION=v22.12.0
NODE_DIR=/mnt/vol1/Project/node22
OLD_JAR=/mnt/vol1/Project/Backend/idCard.jar
PORT=6001
export PATH="$NODE_DIR/bin:$PATH:/root/.npm-global/bin"

log() { echo "==> $*"; }
mkdir -p "$SHARED/storage" "$BASE/releases"

# 1. Node 22 installed privately, so other apps on this server keep their Node.
if [ ! -x "$NODE_DIR/bin/node" ] || [ "$("$NODE_DIR/bin/node" -v)" != "$NODE_VERSION" ]; then
  log "Installing Node $NODE_VERSION in $NODE_DIR"
  tmp=$(mktemp -d)
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz" -o "$tmp/node.tar.xz"
  rm -rf "$NODE_DIR" && mkdir -p "$NODE_DIR"
  tar -xJf "$tmp/node.tar.xz" -C "$NODE_DIR" --strip-components=1
  rm -rf "$tmp"
fi
NODE_BIN="$NODE_DIR/bin/node"

# 2. Settings file, created once. Database and SMTP credentials are taken from the
#    previous Java release on this server, so no secrets live in the repository.
if [ ! -f "$ENV_FILE" ]; then
  log "Creating $ENV_FILE"
  props=""
  if [ -f "$OLD_JAR" ]; then
    tmp=$(mktemp -d)
    profile=$( (cd "$tmp" && (unzip -p "$OLD_JAR" BOOT-INF/classes/application.properties 2>/dev/null || (jar xf "$OLD_JAR" BOOT-INF/classes/application.properties && cat BOOT-INF/classes/application.properties))) | sed -n 's/^spring.profiles.active=//p' | tr -d '\r')
    profile=${profile:-prod}
    props=$( (cd "$tmp" && (unzip -p "$OLD_JAR" "BOOT-INF/classes/application-$profile.properties" 2>/dev/null || (jar xf "$OLD_JAR" "BOOT-INF/classes/application-$profile.properties" && cat "BOOT-INF/classes/application-$profile.properties"))) | tr -d '\r')
    rm -rf "$tmp"
  fi
  prop() { echo "$props" | sed -n "s/^$1=//p" | head -1; }
  DB_URL="${NEW_DATABASE_URL:-}"
  if [ -z "$DB_URL" ]; then
    jdbc=$(prop spring.datasource.url); user=$(prop spring.datasource.username); pass=$(prop spring.datasource.password)
    [ -n "$jdbc" ] || { echo "No database settings found. Set NEW_DATABASE_URL in GitLab CI/CD variables."; exit 1; }
    hostport=$(echo "$jdbc" | sed -E 's#jdbc:postgresql://([^/]+)/.*#\1#')
    DB_URL="postgresql://$("$NODE_BIN" -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$user"):$("$NODE_BIN" -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$pass")@$hostport/${NEW_DATABASE_NAME:-idstudio_v2}"
  fi
  smtp_user=$(prop spring.mail.username); smtp_pass=$(prop spring.mail.password)
  redis=""
  if command -v redis-cli >/dev/null && redis-cli ping 2>/dev/null | grep -q PONG; then redis="redis://127.0.0.1:6379"; fi
  umask 077
  cat > "$ENV_FILE" <<ENV
NODE_ENV="production"
PORT="$PORT"
HOST="0.0.0.0"
DATABASE_URL="$DB_URL"
JWT_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
APP_URL="${APP_URL:-https://idstudio.in}"
API_PUBLIC_URL="${API_PUBLIC_URL:-https://idstudio.in/api}"
CORS_ORIGINS="${CORS_ORIGINS:-https://idstudio.in,https://www.idstudio.in}"
REDIS_URL="$redis"
STORAGE_DRIVER="local"
STORAGE_DIR="$SHARED/storage"
MAIL_DRIVER="$([ -n "$smtp_user" ] && echo smtp || echo log)"
SMTP_HOST="$(prop spring.mail.host)"
SMTP_PORT="$(prop spring.mail.port)"
SMTP_USER="$smtp_user"
SMTP_PASS="$smtp_pass"
MAIL_FROM="ID Card Studio <${smtp_user:-no-reply@idstudio.in}>"
MAX_UPLOAD_MB="50"
ENV
fi
set -a; . "$ENV_FILE"; set +a

# 3. Install, prepare the database.
cd "$RELEASE"
ln -sfn "$ENV_FILE" .env
log "Installing dependencies"
"$NODE_DIR/bin/npm" install --omit=dev --no-audit --no-fund --no-package-lock
"$NODE_DIR/bin/npx" prisma generate
"$NODE_BIN" dist/scripts/ensure-database.js
"$NODE_DIR/bin/npx" prisma migrate deploy
if [ -n "${SUPER_ADMIN_EMAIL:-}" ]; then
  "$NODE_BIN" dist/scripts/create-super-admin.js --if-none "$SUPER_ADMIN_EMAIL" "${SUPER_ADMIN_NAME:-Super Admin}"
fi
if [ -n "${DEMO_ADMIN_HASH_B64:-}" ]; then
  log "Loading demo data"
  DEMO_ADMIN_EMAIL="${DEMO_ADMIN_EMAIL:-admin@idstudio.in}" DEMO_ADMIN_HASH_B64="$DEMO_ADMIN_HASH_B64" "$NODE_BIN" dist/scripts/demo-data.js
fi

# 4. Switch traffic: stop the old Java app (first deploy) and (re)start the new release.
previous=$(readlink -f "$BASE/current" 2>/dev/null || true)
ln -sfn "$RELEASE" "$BASE/current"
java_pid=$(lsof -ti :$PORT -sTCP:LISTEN 2>/dev/null | head -1 || true)
if [ -n "$java_pid" ] && ps -p "$java_pid" -o comm= | grep -qi java; then
  log "Stopping old Java backend (pid $java_pid)"
  kill "$java_pid" || true
  sleep 3
fi
pm2 delete id-studio-api id-studio-worker >/dev/null 2>&1 || true
ENV_FILE="$ENV_FILE" NODE_BIN="$NODE_BIN" pm2 start "$BASE/current/deploy/ecosystem.config.cjs"

# 5. Health check, with rollback.
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/ready" >/dev/null 2>&1; then
    log "New backend is healthy"
    pm2 save
    ls -1dt "$BASE"/releases/* | tail -n +6 | xargs -r rm -rf   # keep 5 releases
    exit 0
  fi
  sleep 2
done
echo "!! Health check failed; rolling back"
pm2 logs id-studio-api --lines 60 --nostream || true
pm2 delete id-studio-api id-studio-worker >/dev/null 2>&1 || true
if [ -n "$previous" ] && [ "$previous" != "$RELEASE" ] && [ -d "$previous" ]; then
  ln -sfn "$previous" "$BASE/current"
  ENV_FILE="$ENV_FILE" NODE_BIN="$NODE_BIN" pm2 start "$BASE/current/deploy/ecosystem.config.cjs" && pm2 save
elif [ -f "$OLD_JAR" ]; then
  nohup java -jar "$OLD_JAR" --server.port=$PORT > /mnt/vol1/Project/Backend/idCard.log 2>&1 &
  echo "Old Java backend restarted."
fi
exit 1
