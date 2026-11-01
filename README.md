# SautiCall

The public site uses the approved Clear White design. Copy, colors, fonts, images, feature switches, and payment gateways are edited in the admin panel.

## Local

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Customer phone setup

This is the path from a new account to a working trunk.

1. Signup creates the VoIP.ms client for that customer. The client uses the customer ID mailbox, not the customer's personal email. If the mobile number is missing, the client is finished when the number or address is saved.
2. The first paid plan adds that plan's phone-company balance to the VoIP.ms client once. A later plan does not add the plan balance again. A minute bundle adds its own payment.
3. Once the subscription is paid and the required email and mobile confirmation are done, SautiCall creates the first extension from the signup name and email. It also creates the company department. If the plan includes the AI receptionist, that extension is the receptionist and inbound calls go there. Otherwise SautiCall creates a Main ring group, puts the first extension in it, and uses that group as the inbound route. The customer does not have to create this first person or group.
4. Buying a number creates the VoIP.ms SIP sub-account and starts the 3CX trunk. The sub-account is SIP with a username and password, an ATA device, IP phone or softphone, the customer’s number as caller ID, Canada routing Premium, international route Value, international calls off, *225 off, no hold music, and call recording off. It saves the number on the customer account. The trunk is named with the VoIP.ms line account, for example `577137_I0000002`, because 3CX does not show a trunk id. Inbound calls use the ring group, or the AI extension when the receptionist is on the plan. The outbound rule is limited to the company department's extension range, and the trunk is assigned to that department. A number transfer starts the same SIP account and trunk only after VoIP.ms lists the transferred number as owned.
5. The trunk is tried automatically up to 3 times. Each try is logged. The customer sees the status on their numbers page. Lines & trunks shows the same line, including a failure. After 3 automatic tries it waits for an administrator. An administrator can retry without a limit, create the trunk in 3CX under the VoIP.ms line account name and read it by that name, or mark routing finished by hand. Reading the trunk updates the customer status.
6. Check trunk and routes in 3CX reads registration, the inbound route, and the outbound rule, then updates the line. It does not place a call. After the trunk is registered and both routes are saved, Lines & trunks can start an inbound test and an outbound test through that trunk. Record successful test calls marks the trunk finished only after 3CX shows it registered and both routes are saved. The record button itself does not place a call.

An administrator finishing a stuck number from Number requests, with Buy this number or by saving Ordered when VoIP.ms already owns it, also starts the trunk. Opening Lines & trunks adds bought numbers that never became a line, creates a missing default extension for a paid and verified account, and starts any trunk that has not used its 3 tries.

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

That gets a certificate for the server's public IP address from Let's Encrypt and sends every HTTP visit to HTTPS. The IP certificate lasts about six days, and Certbot renews it. Sign-in cookies are sent only over HTTPS after this. Confirmation links, checkout return addresses, and the inbound email endpoint use `https://sauticall.com`. An IP address saved as the public origin is not used.

When the domain already points at the static IP, issue the certificate for that name:

```bash
sudo DOMAIN=sauticall.com CERT_EMAIL=you@example.com bash /opt/sauticall/deploy/lightsail/enable-https.sh
```

Later updates pull `main` from GitHub and rebuild:

```bash
sudo bash /opt/sauticall/deploy/lightsail/update.sh
```

`GET /api/health` returns `{ "ok": true }` when the app and database are up.
