#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root on the Lightsail instance."
  exit 1
fi

APP_DIR=/opt/sauticall
ENV_FILE=/etc/sauticall.env
cd "${APP_DIR}"
sudo --preserve-env=ADMIN_EMAIL,ADMIN_PASSWORD,SAUTICALL_DATA_DIR,SAUTICALL_UPLOAD_DIR,NODE_ENV,HOSTNAME,PORT \
  -u sauticall bash -lc "set -a; . '${ENV_FILE}'; set +a; cd '${APP_DIR}' && npm ci && npm run build"
systemctl restart sauticall
systemctl --no-pager --full status sauticall
