# HRMS — AWS Deployment Guide (3 instances, IP-based HTTP)

This deploys the app on **3 AWS resources** exactly as you planned:

| Role         | AWS service      | What runs on it                               |
|--------------|------------------|-----------------------------------------------|
| Frontend     | EC2 (Ubuntu 22.04) | nginx — serves the built React app **and** reverse-proxies `/api` to the backend |
| Backend      | EC2 (Ubuntu 22.04) | Node/Express API under PM2 on port 5000       |
| Database     | RDS for MySQL    | the `corehrms` database                        |

```
                 (internet, HTTP :80)
  Browser ───────────────────────────────►  FRONTEND EC2  (nginx)
                                              │  serves /  -> React build
                                              │  proxies /api -> ┐
                                              ▼                  │ VPC-private :5000
                                          (static files)         ▼
                                                            BACKEND EC2 (Node/PM2)
                                                                 │ VPC-private :3306
                                                                 ▼
                                                              RDS MySQL
```

**Why the proxy design:** the browser only ever talks to the frontend's IP. nginx forwards `/api` calls to the backend over the private VPC network. Result: **no CORS problems, the backend port 5000 is never exposed to the internet, and the backend IP is not baked into the JS** (you can replace the backend without rebuilding the frontend).

---

## 0. Recommended instance sizing (cost-optimized)

Start small; you can resize later (stop instance → change type → start).

| Resource     | Type            | Notes                                              |
|--------------|-----------------|----------------------------------------------------|
| Frontend EC2 | `t3.micro`      | Just nginx serving static files. Tiny load.        |
| Backend EC2  | `t3.small`      | Node + Prisma. `t3.micro` works for light use; `small` (2GB) is safer because the API accepts large base64 payloads. |
| RDS MySQL    | `db.t3.micro`, 20GB gp3 | Fine to start. Enable **automated backups** (7 days). Single-AZ to save cost; switch to Multi-AZ for production HA later. |
| Region       | Pick the one closest to your users (e.g. `ap-south-1` Mumbai). Keep **all 3 in the same region & VPC.** |

> 💡 All three live in the **same VPC** (the default VPC is fine) so they reach each other by private IP for free.

---

## Part A — Create the RDS MySQL database

1. RDS console → **Create database** → **Standard create** → **MySQL** (8.0).
2. Templates: **Free tier** (or Dev/Test).
3. Settings:
   - DB instance identifier: `hrms-db`
   - Master username: `hrms_admin`
   - Master password: choose a strong one → **save it**.
4. Instance: `db.t3.micro`. Storage: 20 GB gp3.
5. Connectivity:
   - **Don't** connect to an EC2 yet (we'll use security groups).
   - **Public access: No.**
   - VPC: default VPC (same one your EC2s will use).
6. Additional config → **Initial database name: `corehrms`**. ← important, this creates the DB.
7. Create. Wait ~5–10 min until **Available**, then copy the **Endpoint** (looks like `hrms-db.xxxx.ap-south-1.rds.amazonaws.com`).

---

## Part B — Security groups (the firewall — get this right)

Create/identify three security groups (EC2 console → Security Groups):

**1. `hrms-frontend-sg`** (attach to frontend EC2)
| Type  | Port | Source            | Why                        |
|-------|------|-------------------|----------------------------|
| HTTP  | 80   | `0.0.0.0/0`       | public website             |
| SSH   | 22   | **My IP**         | your admin access only     |

**2. `hrms-backend-sg`** (attach to backend EC2)
| Type        | Port | Source                | Why                                   |
|-------------|------|-----------------------|---------------------------------------|
| Custom TCP  | 5000 | `hrms-frontend-sg`    | only the frontend may call the API    |
| SSH         | 22   | **My IP**             | your admin access only                |

**3. `hrms-rds-sg`** (attach to the RDS database)
| Type       | Port | Source             | Why                              |
|------------|------|--------------------|----------------------------------|
| MYSQL/Aurora | 3306 | `hrms-backend-sg`  | only the backend may reach the DB |

> Setting **Source** to another security group (not an IP) is the trick — it means "any instance in that group", so it keeps working even if instance IPs change.

To attach `hrms-rds-sg` to the DB: RDS → `hrms-db` → Modify → Connectivity → set the security group → apply immediately.

---

## Part C — Backend EC2

1. Launch EC2 → **Ubuntu Server 22.04 LTS** → `t3.small` → your key pair → security group **`hrms-backend-sg`**.
2. SSH in: `ssh -i your-key.pem ubuntu@<backend-public-ip>`
3. Get the code (use **one**):
   ```bash
   # Option A — clone from GitHub (recommended)
   git clone <your-repo-url> ~/enterprise-hrms
   # Option B — no GitHub: from your PC, copy the folder up with scp/WinSCP to
   #            /home/ubuntu/enterprise-hrms
   ```
4. Create the backend env file and fill it in:
   ```bash
   cd ~/enterprise-hrms
   cp deploy/backend/.env.production.example backend/.env
   nano backend/.env
   ```
   Set:
   - `DATABASE_URL` → your RDS endpoint, `hrms_admin`, the password, `/corehrms`.
     Tip: append `?connection_limit=10&pool_timeout=20` to cap the DB pool on a small instance.
   - `JWT_SECRET` → run `openssl rand -hex 48` and paste the result.
   - `CORS_ORIGIN` → `http://<frontend-public-ip>` (fill in after Part D; harmless placeholder until then).
   - `SMTP_*` → your real SMTP credentials (Gmail App Password, etc.).
5. Provision + start:
   ```bash
   bash deploy/backend/setup-backend.sh
   ```
   This installs Node 20, PM2, runs `prisma migrate deploy` (creates all tables in RDS), and starts the API. Run the `pm2 startup` line it prints (once) so it survives reboots.
6. Verify: `curl http://localhost:5000/api/health` → `{"status":"ok",...}`.

---

## Part D — Frontend EC2

1. Launch EC2 → **Ubuntu 22.04 LTS** → `t3.micro` → your key pair → security group **`hrms-frontend-sg`**.
2. SSH in and get the code into `~/enterprise-hrms` (same as Part C step 3).
3. **Point nginx at the backend's PRIVATE IP** (find it on the backend EC2's details page, `10.x.x.x`):
   ```bash
   cd ~/enterprise-hrms
   sed -i 's/BACKEND_PRIVATE_IP/10.0.1.23/' deploy/frontend/nginx-hrms.conf   # use your real IP
   ```
4. Provision + build + publish:
   ```bash
   bash deploy/frontend/setup-frontend.sh
   ```
5. Open `http://<frontend-public-ip>/` in a browser — the app loads and can log in.
6. Go back to the **backend** `.env`, set `CORS_ORIGIN=http://<frontend-public-ip>`, and reload:
   ```bash
   pm2 reload hrms-backend
   ```

---

## Part E — Get your data in

The schema/tables are created by `prisma migrate deploy` (Part C). To load real data
(the existing roster / users), point your local import/restore scripts at the **RDS**
`DATABASE_URL` instead of localhost and run them, **or** restore a MySQL dump:

```bash
# Restore an existing dump into RDS (run from anywhere that can reach RDS, e.g. the backend EC2):
mysql -h <rds-endpoint> -u hrms_admin -p corehrms < your_dump.sql
```

> The first admin login: if you have no users yet, run your user-seed/migrate script
> (`backend/scripts/migrateUsers.js`) with `DATABASE_URL` pointed at RDS.

---

## Ongoing deploys (your "git pull + restart" flow)

After you push changes:

```bash
# Backend EC2
bash ~/enterprise-hrms/deploy/backend/deploy-backend.sh    # pull, migrate, zero-downtime reload

# Frontend EC2
bash ~/enterprise-hrms/deploy/frontend/deploy-frontend.sh  # pull, rebuild, republish
```

Each script pulls the current branch, installs deps, and restarts. Backend reloads with **zero downtime** via PM2; frontend republishes the new build to nginx.

---

## Optimizations already built in

- **nginx gzip** on JS/CSS/JSON + **1-year immutable cache** on hashed `/assets/*` (and `no-cache` on `index.html` so deploys are picked up instantly).
- **Vite manual chunks** — React, charts, xlsx/jspdf export, html2canvas, and framer-motion are split into separate vendor bundles that the browser caches across deploys.
- **PM2** with `max_memory_restart` (auto-recovers from leaks) and boot persistence.
- **Same-origin API proxy** — no CORS round-trips, backend not internet-exposed.
- **Private-IP DB & API traffic** — stays in the VPC (faster + free, no data-transfer charges).
- **Prisma connection pool cap** via the `connection_limit` URL param for small instances.

---

## Harden later (when you add a domain)

You chose IP/HTTP for now. When ready for production, in priority order:
1. **Buy a domain + HTTPS** — point DNS at the frontend EC2, then `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx`. (HTTP is fine for testing but sends JWTs/passwords in clear text.)
2. **Secrets** — move `JWT_SECRET`/DB password to AWS SSM Parameter Store or Secrets Manager instead of `.env`.
3. **RDS Multi-AZ + longer backup retention** for high availability.
4. **Elastic IPs** on both EC2s so the IPs don't change on stop/start.
5. **CloudWatch alarms** on CPU/memory + an automated `mysqldump` to S3.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Frontend loads but login fails / "API request failed" | nginx `BACKEND_PRIVATE_IP` correct? `hrms-backend-sg` allows 5000 from `hrms-frontend-sg`? `pm2 logs hrms-backend`. |
| Backend won't start, DB error | `DATABASE_URL` correct & password URL-encoded? `hrms-rds-sg` allows 3306 from `hrms-backend-sg`? RDS **Available**? |
| `prisma migrate deploy` hangs | Backend EC2 can't reach RDS — security group / same-VPC issue. |
| Password reset email not arriving | `SMTP_*` set in `backend/.env`? For Gmail use a 16-char **App Password**, not the login password. |
| Changes not showing after deploy | Hard-refresh (Ctrl+Shift+R); `index.html` is `no-cache` so this should be rare. |
| 413 Request Entity Too Large on upload | already handled (nginx `client_max_body_size 110m` + express 100mb). Raise both if needed. |

Useful commands:
```bash
pm2 status                 # backend process state
pm2 logs hrms-backend      # live backend logs
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```
