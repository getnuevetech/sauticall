#!/usr/bin/env bash
# Clone or update the public GitHub repository on the server.
set -euo pipefail

APP_DIR=/opt/sauticall
REPO="${SAUTICALL_REPO:-https://github.com/getnuevetech/sauticall.git}"
BRANCH="${SAUTICALL_BRANCH:-main}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y git ca-certificates

if [[ ! -d "${APP_DIR}/.git" ]]; then
  rm -rf "${APP_DIR}"
  git clone --branch "${BRANCH}" "${REPO}" "${APP_DIR}"
else
  git -c safe.directory="${APP_DIR}" -C "${APP_DIR}" fetch origin "${BRANCH}"
  git -c safe.directory="${APP_DIR}" -C "${APP_DIR}" checkout "${BRANCH}"
  git -c safe.directory="${APP_DIR}" -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
fi
