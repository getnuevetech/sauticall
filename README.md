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

This runs on an Ubuntu Lightsail instance. The site stays on port 3000 and Nginx serves it on port 80. The database and uploaded images live in `/var/lib/sauticall`, so a later code update does not wipe them.

From your computer, copy the project to the instance (replace the IP):

```bash
rsync -az --exclude node_modules --exclude .next --exclude data --exclude public/uploads \
  ./ ubuntu@LIGHTSAIL_IP:/tmp/sauticall
ssh ubuntu@LIGHTSAIL_IP 'sudo mkdir -p /opt/sauticall && sudo rsync -a /tmp/sauticall/ /opt/sauticall/'
ssh ubuntu@LIGHTSAIL_IP 'sudo ADMIN_EMAIL=you@example.com ADMIN_PASSWORD="choose a long password" bash /opt/sauticall/deploy/lightsail/install.sh'
```

In the Lightsail networking tab, allow HTTP (80). The design is then available at `http://LIGHTSAIL_IP`.

After the domain points at the instance static IP, allow HTTPS (443) and run:

```bash
ssh ubuntu@LIGHTSAIL_IP 'sudo DOMAIN=sauticall.example CERT_EMAIL=you@example.com bash /opt/sauticall/deploy/lightsail/enable-https.sh'
```

Later updates:

```bash
rsync -az --exclude node_modules --exclude .next --exclude data --exclude public/uploads \
  ./ ubuntu@LIGHTSAIL_IP:/tmp/sauticall
ssh ubuntu@LIGHTSAIL_IP 'sudo rsync -a /tmp/sauticall/ /opt/sauticall/ && sudo bash /opt/sauticall/deploy/lightsail/update.sh'
```

`GET /api/health` returns `{ "ok": true }` when the app and database are up.
