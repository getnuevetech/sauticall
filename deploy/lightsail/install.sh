#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root on the Lightsail instance."
  exit 1
fi

APP_DIR=/opt/sauticall
DATA_DIR=/var/lib/sauticall
ENV_FILE=/etc/sauticall.env

if [[ ! -f "${APP_DIR}/package.json" ]]; then
  echo "Copy the SautiCall project to ${APP_DIR} before running this script."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg build-essential python3 nginx

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! id sauticall >/dev/null 2>&1; then
  useradd --system --home "${DATA_DIR}" --shell /usr/sbin/nologin sauticall
fi

mkdir -p "${DATA_DIR}/uploads"
chown -R sauticall:sauticall "${DATA_DIR}"

escape_env() {
  local value=${1//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/}
  printf '"%s"' "${value}"
}

if [[ ! -f "${ENV_FILE}" ]]; then
  if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
    echo "Set ADMIN_PASSWORD for the first install. Example: ADMIN_PASSWORD='a long password' bash install.sh"
    exit 1
  fi
  umask 077
  cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
HOSTNAME=0.0.0.0
PORT=3000
SAUTICALL_DATA_DIR=${DATA_DIR}
SAUTICALL_UPLOAD_DIR=${DATA_DIR}/uploads
SAUTICALL_COOKIE_SECURE=0
ADMIN_EMAIL=$(escape_env "${ADMIN_EMAIL:-admin@sauticall.test}")
ADMIN_PASSWORD=$(escape_env "${ADMIN_PASSWORD}")
EOF
  chown root:sauticall "${ENV_FILE}"
  chmod 640 "${ENV_FILE}"
fi

chown -R sauticall:sauticall "${APP_DIR}"
sudo --preserve-env=ADMIN_EMAIL,ADMIN_PASSWORD,SAUTICALL_DATA_DIR,SAUTICALL_UPLOAD_DIR,NODE_ENV,HOSTNAME,PORT \
  -u sauticall bash -lc "set -a; . '${ENV_FILE}'; set +a; cd '${APP_DIR}' && npm ci && npm run build"

install -m 644 "${APP_DIR}/deploy/lightsail/sauticall.service" /etc/systemd/system/sauticall.service
systemctl daemon-reload
systemctl enable sauticall
systemctl restart sauticall

install -m 644 "${APP_DIR}/deploy/lightsail/nginx.conf" /etc/nginx/sites-available/sauticall
ln -sfn /etc/nginx/sites-available/sauticall /etc/nginx/sites-enabled/sauticall
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "SautiCall is proxied on port 80."
echo "In the Lightsail console, allow HTTP (80). After a domain is attached, run deploy/lightsail/enable-https.sh."
