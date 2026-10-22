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

In the Lightsail console, region **Virginia (us-east-1)**:

1. Create an instance named `sauticall` using **Linux/Unix** and **Ubuntu 24.04 LTS**.
2. Under **Add launch script**, paste `deploy/lightsail/cloud-init.yaml`. That installs Node.js 22 and Nginx, then clones `https://github.com/getnuevetech/sauticall.git` into `/opt/sauticall`.
3. Choose the **2 GB RAM** plan.
4. Create a static IP named `sauticall-ip` and attach it to the instance.
5. In the IPv4 firewall, keep SSH on port 22 and add HTTP 80 and HTTPS 443.

The database directory `/var/lib/sauticall` stays outside the git checkout, so a later pull does not wipe content or uploads. Wait until the instance is **Running** and cloud-init has had a few minutes to clone.

If the AWS CLI is configured on a machine that has this repository, `bash deploy/lightsail/provision.sh` creates the same instance. Optional overrides: `LIGHTSAIL_REGION`, `LIGHTSAIL_AZ`, `LIGHTSAIL_INSTANCE`, `LIGHTSAIL_BUNDLE`, `LIGHTSAIL_BLUEPRINT`, `LIGHTSAIL_KEY_NAME`, `LIGHTSAIL_STATIC_IP`.

### 2. Pull GitHub onto the server and install

No other computer needs the repository. On the Lightsail instance page, choose **Connect**, then **Connect using SSH**. That opens a terminal on the server. Paste:

```bash
curl -fsSL https://raw.githubusercontent.com/getnuevetech/sauticall/main/deploy/lightsail/bootstrap.sh -o /tmp/sauticall-bootstrap.sh
sudo ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='choose a long password' bash /tmp/sauticall-bootstrap.sh
```

The script installs git, clones `https://github.com/getnuevetech/sauticall.git` into `/opt/sauticall` when that checkout is missing, then builds and starts the site. Nginx serves it on port 80. Open `http://STATIC_IP`.

If cloud-init already cloned the repository, this same command uses that checkout and continues with the install.

### 3. Turn on HTTPS

In the Lightsail instance networking page, HTTPS on TCP 443 must be allowed. Then, in the same SSH terminal, paste:

```bash
sudo CERT_EMAIL=you@example.com bash /opt/sauticall/deploy/lightsail/enable-https.sh
```

That gets a certificate for the server's public IP address from Let's Encrypt and sends every HTTP visit to HTTPS. The IP certificate lasts about six days, and Certbot renews it. Sign-in cookies are sent only over HTTPS after this.

When a domain name already points at the static IP, use that name instead:

```bash
sudo DOMAIN=sauticall.example CERT_EMAIL=you@example.com bash /opt/sauticall/deploy/lightsail/enable-https.sh
```

Later updates pull `main` from GitHub and rebuild:

```bash
sudo bash /opt/sauticall/deploy/lightsail/update.sh
```

`GET /api/health` returns `{ "ok": true }` when the app and database are up.
