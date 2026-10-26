#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root on the Lightsail instance."
  exit 1
fi

APP_DIR=/opt/sauticall
ENV_FILE=/etc/sauticall.env

if [[ -z "${SAUTICALL_UPDATED:-}" ]]; then
  bash "${APP_DIR}/deploy/lightsail/git-sync.sh"
  exec env SAUTICALL_UPDATED=1 bash "${APP_DIR}/deploy/lightsail/update.sh"
fi

cd "${APP_DIR}"
echo "Building $(git -c safe.directory="${APP_DIR}" -C "${APP_DIR}" rev-parse --short HEAD)"
sudo --preserve-env=ADMIN_EMAIL,ADMIN_PASSWORD,SAUTICALL_DATA_DIR,SAUTICALL_UPLOAD_DIR,NODE_ENV,HOSTNAME,PORT \
  -u sauticall bash -lc "set -a; . '${ENV_FILE}'; set +a; cd '${APP_DIR}' && npm ci && npm run build"
systemctl restart sauticall
systemctl --no-pager --full status sauticall
if [[ -f "${ENV_FILE}" ]] && grep -q '^SAUTICALL_COOKIE_SECURE=0' "${ENV_FILE}"; then
  echo "The site is still on HTTP. Open TCP 443 in the Lightsail firewall, then run: CERT_EMAIL=you@example.com bash ${APP_DIR}/deploy/lightsail/enable-https.sh"
fi
