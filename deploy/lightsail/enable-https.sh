#!/usr/bin/env bash
# Turn on HTTPS for the public site. A domain is optional: with only CERT_EMAIL,
# Let's Encrypt issues a certificate for this server's public IPv4 address.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root on the Lightsail instance."
  exit 1
fi

if [[ -z "${CERT_EMAIL:-}" ]]; then
  echo "Usage: CERT_EMAIL=you@example.com bash enable-https.sh"
  echo "Or, when a domain already points at this server: DOMAIN=sauticall.example CERT_EMAIL=you@example.com bash enable-https.sh"
  exit 1
fi

if ! [[ "${CERT_EMAIL}" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]]; then
  echo "CERT_EMAIL must be an email address."
  exit 1
fi

ENV_FILE=/etc/sauticall.env
WEBROOT=/var/www/sauticall
SITE=/etc/nginx/sites-available/sauticall

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "SautiCall is not installed yet. Run deploy/lightsail/install.sh first."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl nginx snapd
systemctl enable --now snapd.socket
snap wait system seed.loaded || true
if ! snap list certbot >/dev/null 2>&1; then
  snap install certbot --classic
fi
CERTBOT=/snap/bin/certbot

version="$("${CERTBOT}" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
if [[ -z "${version}" ]]; then
  echo "Certbot did not report a version."
  exit 1
fi
if ! python3 - "${version}" <<'PY'
import sys
parts = [int(item) for item in sys.argv[1].split(".")[:3]]
sys.exit(0 if tuple(parts) >= (5, 4, 0) else 1)
PY
then
  echo "Certbot ${version} is installed. HTTPS for an IP address needs Certbot 5.4 or newer."
  exit 1
fi

mkdir -p "${WEBROOT}/.well-known/acme-challenge"
if [[ ! -f "${SITE}" ]] || ! grep -q ssl_certificate "${SITE}"; then
  install -m 644 /opt/sauticall/deploy/lightsail/nginx.conf "${SITE}"
  ln -sfn "${SITE}" /etc/nginx/sites-enabled/sauticall
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
fi

if [[ -n "${DOMAIN:-}" ]]; then
  if ! [[ "${DOMAIN}" =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo "DOMAIN must be a hostname, such as sauticall.example."
    exit 1
  fi
  NAME="${DOMAIN}"
  "${CERTBOT}" certonly --webroot -w "${WEBROOT}" -d "${DOMAIN}" \
    --non-interactive --agree-tos -m "${CERT_EMAIL}" --keep-until-expiring
else
  IP="$(curl -4 -fsS https://checkip.amazonaws.com | tr -d '[:space:]')"
  if ! [[ "${IP}" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
    echo "Could not read this server's public IPv4 address."
    exit 1
  fi
  NAME="${IP}"
  "${CERTBOT}" certonly --webroot -w "${WEBROOT}" --ip-address "${IP}" \
    --preferred-profile shortlived \
    --non-interactive --agree-tos -m "${CERT_EMAIL}" --keep-until-expiring
fi

if [[ ! -f "/etc/letsencrypt/live/${NAME}/fullchain.pem" ]]; then
  echo "The certificate was not saved at /etc/letsencrypt/live/${NAME}."
  ls -la /etc/letsencrypt/live || true
  exit 1
fi

cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/sh
systemctl reload nginx
EOF
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

cat > "${SITE}" <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location ^~ /.well-known/acme-challenge/ {
        root ${WEBROOT};
        default_type text/plain;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;
    client_max_body_size 20m;

    ssl_certificate /etc/letsencrypt/live/${NAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${NAME}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    add_header Strict-Transport-Security "max-age=86400" always;

    location ^~ /.well-known/acme-challenge/ {
        root ${WEBROOT};
        default_type text/plain;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

nginx -t
systemctl reload nginx

set_env() {
  local key=$1 value=$2
  if grep -q "^${key}=" "${ENV_FILE}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

set_env SAUTICALL_COOKIE_SECURE 1
if [[ -n "${DOMAIN:-}" && ! "${DOMAIN}" =~ ^[0-9]+(\.[0-9]+){3}$ ]]; then
  PUBLIC_ORIGIN="https://${DOMAIN}"
else
  PUBLIC_ORIGIN="https://sauticall.com"
fi
set_env SAUTICALL_PUBLIC_ORIGIN "${PUBLIC_ORIGIN}"
systemctl restart sauticall

echo "HTTPS is on for https://${NAME}."
echo "Checkout and email links use ${PUBLIC_ORIGIN}."
if [[ -z "${DOMAIN:-}" ]]; then
  echo "This certificate lasts about six days. Certbot renews it on its own."
fi
echo "The Lightsail IPv4 firewall must allow TCP 443. In the instance networking page, HTTPS should be listed next to HTTP."
echo "Sign-in cookies are now sent only over HTTPS."
