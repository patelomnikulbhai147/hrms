# Backend EC2 — Complete Setup Guide (for total beginners, on Windows 11)

This walks you **click-by-click and command-by-command** through creating the **backend server** for your HRMS app on AWS and getting the API running on it. No prior AWS knowledge assumed.

> Do the **RDS database** first (separate guide / [DEPLOYMENT.md](DEPLOYMENT.md) Part A) if you haven't — you'll need its **Endpoint** and **password** in Step 5 here. You *can* launch the EC2 first and fill that in later, but the final "start the app" step needs the database reachable.

---

## 0. What you're building

One Linux server (an **EC2 instance**) running your Node.js + Express backend (`backend/server.js`, port 5000). It talks to your MySQL database (on **RDS**, a separate AWS resource). Later, a second EC2 (the **frontend**) forwards `/api` traffic to this backend over the private network.

```
  Browser ──HTTP:80──►  FRONTEND EC2 (nginx)
                              │  proxies /api
                              ▼  (private VPC :5000)
                        ┌─────────────────┐
                        │  BACKEND EC2    │  ◄── THIS GUIDE BUILDS THIS BOX
                        │  Node + PM2     │
                        └────────┬────────┘
                                 ▼ (private VPC :3306)
                             RDS MySQL
```

By the end you'll have: a running Ubuntu 22.04 server, a `.pem` key on your PC to log in, a locked-down security group, and the server's **Public IPv4** (for your SSH) + **Private IPv4** (for the frontend to reach it).

---

## 1. Before you start

- An **AWS account** (console.aws.amazon.com). New accounts get the post-July-2025 Free Tier: up to **$200 credits for 6 months**.
- These ready (you'll paste them in Step 5): your **RDS endpoint**, **RDS master password**, and optionally **SMTP** credentials (Gmail App Password) for password-reset emails.
- Quick term glossary:
  - **EC2 instance** = a virtual Linux server you rent.
  - **AMI** = the OS disk image the server boots (you'll pick Ubuntu 22.04).
  - **Security group** = a firewall around the server (which ports are open, to whom).
  - **Key pair (.pem)** = your password-less login key. Downloaded **once** — keep it safe.

💡 **Cost note (verified 2026):** We use **`t3.small`** (2 GiB RAM) because Node + Prisma + `npm ci` is too heavy for the 1 GiB free `t2.micro`. On a **new** (post-July-2025) account `t3.small` is covered by your $200 credits; on an **old** account it costs ~$15–19/month. To test for free first, launch as `t2.micro` and resize to `t3.small` later (Stop → Actions → Instance settings → Change instance type → Start).

---

## 2. Sign in and pick your Region

1. Go to **https://console.aws.amazon.com/** and sign in.
2. **Top-right corner** of the console shows a Region (e.g. "N. Virginia"). Click it and choose the Region closest to your users — for India, **Asia Pacific (Mumbai) ap-south-1**.
3. ⚠️ **Critical:** your RDS database, this backend, and your future frontend must all be in the **same Region and VPC** so they can talk privately. Pick once, stay consistent.

---

## 3. Launch the backend EC2 instance

1. In the top search bar type `EC2`, click the **EC2** service, then left menu → **Instances** → orange **Launch instances** button. You're now in the one-page **Launch an instance** wizard — work top to bottom.

### Name
2. **Name and tags** → **Name** field → type `hrms-backend`.

### OS image (AMI)
3. **Application and OS Images** → **Quick Start** tab → click the **Ubuntu** tile.
4. In the **AMI** dropdown choose **Ubuntu Server 22.04 LTS (HVM), SSD Volume Type**.
5. **Architecture** dropdown (just below): choose **64-bit (x86)**. 💡 `t3.small` is an Intel/x86 type — picking the Arm AMI with a `t3` type makes the launch fail.

### Instance type
6. **Instance type** dropdown → choose **`t3.small`** (or `t2.micro` to test free, then resize later).

### Key pair (your login)
7. **Key pair (login)** → **Create new key pair**.
   - **Name:** `hrms-key`
   - **Type:** **RSA**
   - **Format:** **`.pem`** (use this for Windows PowerShell/OpenSSH — recommended). Choose `.ppk` only if you'll use PuTTY.
8. Click **Create key pair** → the browser downloads `hrms-key.pem` (usually to **Downloads**). ⚠️ **You can only download it once.** Lose it = you can never log in again.
9. Move it somewhere permanent, e.g. create `C:\Users\<YourName>\keys\` and move `hrms-key.pem` there. Never email it or commit it to Git.

### Network / security group (the firewall)
10. **Network settings** → click **Edit**.
11. Leave **VPC**/**Subnet** at defaults (same VPC as RDS). Ensure **Auto-assign public IP = Enable**.
12. Under **Firewall (security groups)** → **Create security group**.
    - **Name:** `hrms-backend-sg`
    - **Description:** `HRMS backend - SSH from my IP, app port from frontend`
13. **Inbound rule 1 — SSH (your access):** the wizard's first rule →
    - **Type:** `SSH`, **Port:** `22`
    - **Source type:** **My IP** (auto-fills your current IP)
    - ⚠️ Never set SSH source to *Anywhere*.
14. **Inbound rule 2 — App port 5000 (frontend only):** click **Add security group rule** →
    - **Type:** **Custom TCP**, **Port range:** `5000`
    - **Source type:** **Custom**, then type `hrms-frontend-sg` and select it.
    - 💡 This means *only the frontend instances* can reach port 5000 — not the public internet.
15. **If the frontend security group doesn't exist yet** (you haven't built the frontend): **skip rule 2 for now** — launch with just the SSH rule. Add it later: EC2 → **Security Groups** → `hrms-backend-sg` → **Inbound rules** → **Edit inbound rules** → **Add rule** → Custom TCP `5000`, Source **Custom** = `hrms-frontend-sg` → **Save rules**. ⚠️ Never open 5000 to *Anywhere* "just to test" — it publishes your backend to the world.
16. Do **not** add a MySQL/3306 rule here — that belongs on the RDS security group (`hrms-rds-sg` allows 3306 *from* `hrms-backend-sg`).

### Storage & launch
17. **Configure storage** → set **20** GiB, type **gp3**.
18. Right-side **Summary** → confirm Ubuntu 22.04 (x86), `t3.small`, key `hrms-key`, SG `hrms-backend-sg`. **Number of instances = 1**.
19. Click **Launch instance** → **View all instances**. Wait until **Instance state = Running** and **Status check = 2/2 checks passed** (~1–2 min).

### Record the two IPs
20. Click your **hrms-backend** instance → **Details** tab → note:
    - **Public IPv4** (e.g. `13.234.x.x`) → use this to **SSH from your laptop**.
    - **Private IPv4** (e.g. `172.31.x.x`) → the frontend will reach the backend at `http://<this>:5000`. This one never changes.

---

## 4. Connect to it from Windows 11

You log in as user **`ubuntu`** (the default for Ubuntu AMIs — there's no password, the `.pem` *is* your login). Replace `<PUBLIC_IP>` with the Public IPv4 from Step 20, and fix the key path to where you saved it.

### Method A — PowerShell / built-in OpenSSH (recommended, nothing to install)

1. Open **PowerShell** (Start → type "PowerShell").
2. **Lock the key's permissions** (SSH refuses keys other users can read — skipping this gives an `UNPROTECTED PRIVATE KEY FILE` error). Run, replacing the path:
   ```powershell
   icacls "C:\Users\<YourName>\keys\hrms-key.pem" /inheritance:r
   icacls "C:\Users\<YourName>\keys\hrms-key.pem" /grant:r "$($env:USERNAME):(R)"
   ```
3. **Connect:**
   ```powershell
   ssh -i "C:\Users\<YourName>\keys\hrms-key.pem" ubuntu@<PUBLIC_IP>
   ```
   - `-i` = use this identity (key). `ubuntu` = the username. 
4. First time it asks to confirm the host fingerprint → type **`yes`** + Enter.
5. Your prompt becomes `ubuntu@ip-172-...:~$` — you're **inside the server**. (Type `exit` to leave.)

### Method B — PuTTY (GUI, only if you prefer it / chose .ppk)

1. Install **PuTTY** from `https://www.putty.org/` (includes **PuTTYgen**).
2. If you have a `.pem`: open **PuTTYgen** → **Load** → set filter to *All Files* → pick `hrms-key.pem` → **Save private key** → `hrms-key.ppk`.
3. Open **PuTTY** → **Host Name:** `<PUBLIC_IP>`, **Port:** `22` → left tree **Connection → SSH → Auth → Credentials** → **Browse** → select `hrms-key.ppk` → **Open** → **Accept** the host alert → at `login as:` type `ubuntu`.

---

## 5. Put the app on the server and configure it

You're now at the `ubuntu@...:~$` prompt. ⚠️ The deploy kit expects the repo at **`/home/ubuntu/enterprise-hrms`** (the PM2 config hard-codes `/home/ubuntu/enterprise-hrms/backend`) — use that exact folder name.

### 5a. Get the code

**Option A — clone from GitHub (recommended):**
```bash
sudo apt update && sudo apt install -y git
cd ~
git clone <YOUR_GITHUB_REPO_URL> enterprise-hrms
```
- Copy `<YOUR_GITHUB_REPO_URL>` from the green **Code** button on your GitHub repo.
- **Private repo?** When asked for a password, paste a **Personal Access Token** (GitHub → Settings → Developer settings → Personal access tokens, `repo` scope) — not your account password.
- If your code is on a branch (e.g. `enterprise-hrms-enhancements`):
  ```bash
  cd ~/enterprise-hrms && git checkout enterprise-hrms-enhancements
  ```

**Option B — no GitHub, upload from Windows with WinSCP:** install WinSCP → New Site → SFTP, Host = `<PUBLIC_IP>`, Port `22`, User `ubuntu`, **Advanced → SSH → Authentication** → select your `.pem`/`.ppk` → Login → on the remote side create folder `enterprise-hrms` and drag your project into it. **Don't upload `node_modules`** (it's reinstalled on the server).

Confirm it's there:
```bash
ls ~/enterprise-hrms        # should show: backend  deploy  src  ...
```

### 5b. Create and edit `backend/.env`

The setup script refuses to run without this file.
```bash
cd ~/enterprise-hrms
cp deploy/backend/.env.production.example backend/.env
openssl rand -hex 48          # copy this 96-char string for JWT_SECRET below
nano backend/.env
```
Edit each value (arrow keys to move; **right-click** or **Shift+Insert** to paste):

| Variable | Set it to |
|---|---|
| `PORT` | `5000` (leave) |
| `NODE_ENV` | `production` (leave) |
| `DATABASE_URL` | `mysql://hrms_admin:PASSWORD@RDS_ENDPOINT:3306/corehrms` — see below |
| `JWT_SECRET` | paste the `openssl rand -hex 48` output (keep the quotes) |
| `JWT_EXPIRES_IN` / `_REMEMBER_` / `RESET_TOKEN_` | leave `12h` / `30d` / `15m` |
| `CORS_ORIGIN` | your frontend public IP, e.g. `http://13.200.50.10` (no trailing slash; fill later if unknown) |
| `SMTP_HOST/PORT/SECURE` | `smtp.gmail.com` / `587` / `false` |
| `SMTP_USER` | the Gmail address that sends mail |
| `SMTP_PASS` | a **16-char Gmail App Password** (not your login password) |
| `SMTP_FROM` | e.g. `HRMS Security <no-reply@yourdomain.com>` |

**Building `DATABASE_URL`:**
- `RDS_ENDPOINT` = RDS console → your `corehrms` DB → copy **Endpoint** (e.g. `corehrms.abcd1234.ap-south-1.rds.amazonaws.com`).
- **URL-encode special characters in the password:** `@`→`%40`, `:`→`%3A`, `/`→`%2F`, `#`→`%23`. (e.g. `P@ss:1` → `P%40ss%3A1`.)
- Recommended on a small instance — cap the DB pool by appending `?connection_limit=5`:
  ```
  DATABASE_URL="mysql://hrms_admin:YourEncodedPass@corehrms.abcd1234.ap-south-1.rds.amazonaws.com:3306/corehrms?connection_limit=5"
  ```
Save in nano: **Ctrl+O**, **Enter**, **Ctrl+X**.

### 5c. Run the one-time provisioning script
```bash
cd ~/enterprise-hrms
bash deploy/backend/setup-backend.sh
```
It runs 6 labelled steps (`==> [1/6]` … `[6/6]`): installs system packages, **Node 20**, **PM2**; `npm ci --omit=dev`; `npx prisma generate`; **`npx prisma migrate deploy`** (creates all tables in RDS — this is the step that talks to the database); then `pm2 start` + `pm2 save`.

⚠️ **The script's last output is a `sudo env PATH=... pm2 startup systemd ...` line. Copy that exact line and run it** — that's what makes the backend auto-start after a reboot. Then run `pm2 save` once more.

---

## 6. Verify it works
```bash
pm2 status                              # hrms-backend should be "online"
curl http://localhost:5000/api/health
```
- **Healthy (200):** `{"status":"ok","message":"HRMS Backend is running smoothly.","database":"connected"}`
- **Degraded (503):** `{"status":"degraded",...,"database":"disconnected"}` → API is up but can't reach RDS. Check `DATABASE_URL`, then that `hrms-rds-sg` allows **3306 from `hrms-backend-sg`**, then re-run `npx prisma migrate deploy` from `backend/`. After any `.env` edit: `pm2 reload hrms-backend`.
- **`Connection refused`:** Node isn't running → `pm2 logs hrms-backend` to see why.

💡 You test with `localhost` here because port 5000 is intentionally **not** open to the internet — only the frontend SG can reach it.

---

## 7. Day-to-day operations

```bash
pm2 status                 # state, CPU, memory, restarts
pm2 logs hrms-backend      # live logs (Ctrl+C stops watching, not the app)
pm2 reload hrms-backend    # zero-downtime reload after .env change or code pull
pm2 restart hrms-backend   # full restart if needed
```
Log files persist at `/home/ubuntu/logs/hrms-backend-out.log` and `...-error.log`.

**Deploy code updates later** (pull branch, reinstall, run new migrations, zero-downtime reload):
```bash
cd ~/enterprise-hrms
bash deploy/backend/deploy-backend.sh
```

**After a reboot:** because you ran the `pm2 startup` line + `pm2 save`, it auto-starts. Confirm with `pm2 status`.

---

## 8. (Recommended) Give it a stable IP — Elastic IP

The Public IPv4 from launch **changes if you Stop then Start** the instance (reboot keeps it; full stop/start doesn't), which breaks your saved `ssh` command. An **Elastic IP** is a fixed public IP.

1. EC2 → **Elastic IPs** → **Allocate Elastic IP address** → **Allocate**.
2. Select it → **Actions → Associate Elastic IP address** → Resource type **Instance** → pick **hrms-backend** → **Associate**.
3. SSH to this fixed IP from now on.

💡 Cost: an Elastic IP (and any public IPv4) costs ~$3.60/month, and an **idle/unassociated** one is also billed — **release** it if you stop using the instance. The frontend↔backend link uses the **Private IPv4** (free, never changes), so the Elastic IP is only for your SSH convenience.

---

## 9. Common problems → fixes

| Symptom | Cause / Fix |
|---|---|
| `Permissions for '...pem' are too open` | Run the `icacls` commands in Step 4-A2. |
| `Permission denied (publickey)` | Username must be `ubuntu` (not root/your name); use the correct `.pem`; correct `-i` path. |
| `ssh: connect ... port 22: Connection timed out` | Security group: add **SSH 22 from My IP** to `hrms-backend-sg`; use the **Public** IP; instance must be **Running**. (Your home IP changed? Re-pick **My IP** on the rule.) |
| `Connection refused` on 22 | Instance still booting — wait 1–2 min, retry. |
| `REMOTE HOST IDENTIFICATION HAS CHANGED` | Run `ssh-keygen -R <PUBLIC_IP>` in PowerShell, reconnect, answer `yes`. |
| health = `degraded` 503 | DB unreachable — check `DATABASE_URL`; `hrms-rds-sg` must allow 3306 from `hrms-backend-sg`; re-run `prisma migrate deploy`. |
| `prisma migrate deploy` hangs | Backend can't reach RDS — same-VPC + the `hrms-rds-sg` 3306-from-`hrms-backend-sg` rule. |
| Password-reset email not arriving | `SMTP_*` must be real; Gmail needs a 16-char **App Password**, not the login password. |

---

## Quick checklist

- [ ] Region consistent across EC2 + RDS (+ future frontend)
- [ ] Ubuntu 22.04 **x86_64** AMI, instance `t3.small`
- [ ] `.pem` downloaded once, saved safely, permissions locked with `icacls`
- [ ] `hrms-backend-sg`: SSH **22 from My IP**; TCP **5000 from `hrms-frontend-sg`** (add later if needed — never *Anywhere*)
- [ ] 20 GiB gp3 storage
- [ ] Recorded **Public IPv4** (SSH) and **Private IPv4** (frontend → `:5000`)
- [ ] SSH'd in, repo at `/home/ubuntu/enterprise-hrms`, `backend/.env` filled, `setup-backend.sh` run, `pm2 startup` line executed
- [ ] `curl http://localhost:5000/api/health` returns `"database":"connected"`
- [ ] (Optional) Elastic IP associated
