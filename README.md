# SautiCall

The public site uses the approved Clear White design. Copy, colors, fonts, images, feature switches, and payment gateways are edited in the admin panel.

## Local

```bash
npm install
npm run dev
```

Open http://localhost:3000.

The first admin account is created only when no admin exists:

- Email: `admin@sauticall.test` (or `ADMIN_EMAIL`)
- Password: `SautiCall-Admin-2026` (or `ADMIN_PASSWORD`)

Sign in at http://localhost:3000/account/login and open Admin. Leave the theme values unchanged to keep the approved design.

## AWS Lightsail

Create the server first. Deploying the site is a separate step.

### 1. Create the server

Install the AWS CLI and configure credentials that can manage Lightsail. Then, from this repository:

```bash
bash deploy/lightsail/provision.sh
```

That creates an Ubuntu 24.04 instance named `sauticall` in `us-east-1` on the `small_3_0` bundle (2 GB memory, so the later production build has room), a static IP named `sauticall-ip`, and firewall rules for SSH (22), HTTP (80), and HTTPS (443). The private key is written to `deploy/lightsail/keys/` and is not committed. Cloud-init installs Node.js 22, Nginx, and the `/opt/sauticall` and `/var/lib/sauticall` directories. It does not copy the application.

Optional overrides: `LIGHTSAIL_REGION`, `LIGHTSAIL_AZ`, `LIGHTSAIL_INSTANCE`, `LIGHTSAIL_BUNDLE`, `LIGHTSAIL_BLUEPRINT`, `LIGHTSAIL_KEY_NAME`, `LIGHTSAIL_STATIC_IP`.

Check the instance after a few minutes:

```bash
bash deploy/lightsail/status.sh
```

### 2. Deploy the site

After the static IP answers SSH, copy the project and install it. The site stays on port 3000 and Nginx serves it on port 80. The database and uploaded images live in `/var/lib/sauticall`, so a later code update does not wipe them.

```bash
rsync -az -e "ssh -i deploy/lightsail/keys/sauticall.pem" \
  --exclude node_modules --exclude .next --exclude data --exclude public/uploads \
  ./ ubuntu@STATIC_IP:/tmp/sauticall
ssh -i deploy/lightsail/keys/sauticall.pem ubuntu@STATIC_IP \
  'sudo mkdir -p /opt/sauticall && sudo rsync -a /tmp/sauticall/ /opt/sauticall/'
ssh -i deploy/lightsail/keys/sauticall.pem ubuntu@STATIC_IP \
  'sudo ADMIN_EMAIL=you@example.com ADMIN_PASSWORD="choose a long password" bash /opt/sauticall/deploy/lightsail/install.sh'
```

The design is then available at `http://STATIC_IP`.

After the domain points at the static IP, run:

```bash
ssh -i deploy/lightsail/keys/sauticall.pem ubuntu@STATIC_IP \
  'sudo DOMAIN=sauticall.example CERT_EMAIL=you@example.com bash /opt/sauticall/deploy/lightsail/enable-https.sh'
```

Later updates:

```bash
rsync -az -e "ssh -i deploy/lightsail/keys/sauticall.pem" \
  --exclude node_modules --exclude .next --exclude data --exclude public/uploads \
  ./ ubuntu@STATIC_IP:/tmp/sauticall
ssh -i deploy/lightsail/keys/sauticall.pem ubuntu@STATIC_IP \
  'sudo rsync -a /tmp/sauticall/ /opt/sauticall/ && sudo bash /opt/sauticall/deploy/lightsail/update.sh'
```

`GET /api/health` returns `{ "ok": true }` when the app and database are up.
