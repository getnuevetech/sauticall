#!/usr/bin/env bash
# Run this on the Lightsail server. It clones GitHub, then installs SautiCall.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root on the Lightsail instance."
  exit 1
fi

APP_DIR=/opt/sauticall
REPO="${SAUTICALL_REPO:-https://github.com/getnuevetech/sauticall.git}"
BRANCH="${SAUTICALL_BRANCH:-main}"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y git ca-certificates
  rm -rf "${APP_DIR}"
  git clone --branch "${BRANCH}" "${REPO}" "${APP_DIR}"
fi

exec bash "${APP_DIR}/deploy/lightsail/install.sh"
