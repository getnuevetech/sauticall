#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root on the Lightsail instance."
  exit 1
fi

if [[ -z "${DOMAIN:-}" || -z "${CERT_EMAIL:-}" ]]; then
  echo "Usage: DOMAIN=sauticall.example CERT_EMAIL=you@example.com bash enable-https.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${CERT_EMAIL}" --redirect
sed -i 's/^SAUTICALL_COOKIE_SECURE=0/SAUTICALL_COOKIE_SECURE=1/' /etc/sauticall.env
systemctl restart sauticall
echo "HTTPS is on for ${DOMAIN}, and sign-in cookies are marked secure."
