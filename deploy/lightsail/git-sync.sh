#!/usr/bin/env bash
# Make /opt/sauticall match GitHub main. Local edits on the server are discarded.
# The database stays in /var/lib/sauticall and is not part of this checkout.
set -euo pipefail

APP_DIR=/opt/sauticall
REPO="${SAUTICALL_REPO:-https://github.com/getnuevetech/sauticall.git}"
BRANCH="${SAUTICALL_BRANCH:-main}"

if ! command -v git >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y git ca-certificates
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  rm -rf "${APP_DIR}"
  git clone --branch "${BRANCH}" "${REPO}" "${APP_DIR}"
fi

git -c safe.directory="${APP_DIR}" -C "${APP_DIR}" remote set-url origin "${REPO}"
BEFORE="$(git -c safe.directory="${APP_DIR}" -C "${APP_DIR}" rev-parse --short HEAD 2>/dev/null || echo none)"
git -c safe.directory="${APP_DIR}" -C "${APP_DIR}" fetch --prune origin "+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}"
git -c safe.directory="${APP_DIR}" -C "${APP_DIR}" checkout -f -B "${BRANCH}" "refs/remotes/origin/${BRANCH}"
git -c safe.directory="${APP_DIR}" -C "${APP_DIR}" reset --hard "refs/remotes/origin/${BRANCH}"
AFTER="$(git -c safe.directory="${APP_DIR}" -C "${APP_DIR}" rev-parse --short HEAD)"
echo "Pulled ${BRANCH} from GitHub. Server was ${BEFORE}. Server is now ${AFTER}: $(git -c safe.directory="${APP_DIR}" -C "${APP_DIR}" log -1 --format=%s)"

if id sauticall >/dev/null 2>&1; then
  chown -R sauticall:sauticall "${APP_DIR}"
fi
