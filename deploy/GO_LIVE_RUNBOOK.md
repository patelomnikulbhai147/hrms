# Go-Live Runbook — connect all 3 and make it live

You have: a **frontend EC2**, a **backend EC2**, and an **RDS MySQL** database. This brings them online in order. Do the phases top to bottom — each depends on the previous.

You'll need these 4 values handy:
- **Backend Public IPv4** (to SSH in)
- **Backend Private IPv4** (frontend → backend)
- **Frontend Public IPv4** (the website address + CORS)
- **RDS Endpoint** + master password

---

## Phase 0 — Verify the 3 security groups (do this FIRST)

90% of "it won't connect" problems are here. In EC2 → **Security Groups**, confirm inbound rules:

| Security group | Type | Port | Source |
|---|---|---|---|
| **hrms-rds-sg** | MYSQL/Aurora | 3306 | **hrms-backend-sg** |
| **hrms-backend-sg** | SSH | 22 | **My IP** |
| **hrms-backend-sg** | Custom TCP | 5000 | **hrms-frontend-sg** |
| **hrms-frontend-sg** | HTTP | 80 | **0.0.0.0/0** (Anywhere) |
| **hrms-frontend-sg** | SSH | 22 | **My IP** |

⚠️ Port 5000 must come **from hrms-frontend-sg**, never `0.0.0.0/0`. All 3 resources + RDS must be in the **same VPC/Region**.

---

## Phase 1 — Bring the BACKEND online

SSH into the backend: `ssh -i "C:\path\hrms-key.pem" ubuntu@<BACKEND_PUBLIC_IP>`

```bash
# 1. Get the code (if not already there)
sudo apt update && sudo apt install -y git
cd ~ && git clone <YOUR_GITHUB_REPO_URL> enterprise-hrms
cd ~/enterprise-hrms && git checkout enterprise-hrms-enhancements   # if on a branch

# 2. Configure environment
cp deploy/backend/.env.production.example backend/.env
openssl rand -hex 48           # copy output → JWT_SECRET
nano backend/.env
```
In `backend/.env` set:
- `DATABASE_URL="mysql://hrms_admin:ENCODED_PWD@<RDS_ENDPOINT>:3306/corehrms?connection_limit=5"`
- `JWT_SECRET="<the openssl output>"`
- `CORS_ORIGIN="http://<FRONTEND_PUBLIC_IP>"`
- `SMTP_*` (Gmail App Password) — or leave placeholders for now
Save: **Ctrl+O, Enter, Ctrl+X**.

```bash
# 3. Provision (installs Node 20, PM2, deps, creates all DB tables, starts API)
cd ~/enterprise-hrms
bash deploy/backend/setup-backend.sh
#   ⚠️ copy + run the "sudo env PATH=... pm2 startup systemd ..." line it prints, then:
pm2 save

# 4. Verify backend ↔ database
curl http://localhost:5000/api/health
#   want: {"status":"ok",...,"database":"connected"}
```
If `database:"disconnected"` → re-check `DATABASE_URL` and the `hrms-rds-sg` 3306-from-`hrms-backend-sg` rule.

```bash
# 5. Create your first login user (seed) — reads backend/scripts/data/users.json
cd ~/enterprise-hrms/backend
npm run migrate
```
💡 This seeds the user accounts so you can log in. (For your full company/employee data, use the restore step in Phase 4.)

---

## Phase 2 — Bring the FRONTEND online

SSH into the frontend: `ssh -i "C:\path\hrms-key.pem" ubuntu@<FRONTEND_PUBLIC_IP>`

```bash
# 1. Get the code
sudo apt update && sudo apt install -y git
cd ~ && git clone <YOUR_GITHUB_REPO_URL> enterprise-hrms
cd ~/enterprise-hrms && git checkout enterprise-hrms-enhancements   # if on a branch

# 2. Point nginx at the BACKEND PRIVATE IP (use the backend's 172.x.x.x)
sed -i 's/BACKEND_PRIVATE_IP/<BACKEND_PRIVATE_IP>/' deploy/frontend/nginx-hrms.conf

# 3. Provision (installs nginx + Node, builds the app, publishes, configures nginx)
bash deploy/frontend/setup-frontend.sh
```
This creates `.env.production` (`VITE_API_BASE_URL=/api`), runs `npm run build`, copies `dist/` to `/var/www/hrms`, and loads the nginx config that proxies `/api` → backend.

---

## Phase 3 — Connect & verify (the moment of truth)

1. **Backend CORS:** make sure `backend/.env` has `CORS_ORIGIN=http://<FRONTEND_PUBLIC_IP>`; if you just set it, reload: `pm2 reload hrms-backend` (on the backend EC2).
2. **Open the app:** browser → `http://<FRONTEND_PUBLIC_IP>/` — the login page loads.
3. **Log in** with a seeded account (from `npm run migrate`).
4. **Smoke test:** dashboard loads, open a couple of pages, create/edit one record, refresh — data persists (proves frontend → backend → RDS all work).

If login fails with a network/CORS error:
- frontend → backend: nginx `BACKEND_PRIVATE_IP` correct? `hrms-backend-sg` allows 5000 from `hrms-frontend-sg`?
- check `pm2 logs hrms-backend` on the backend.

---

## Phase 4 — Load your real data (optional, when ready)

The schema/tables already exist (created in Phase 1). To load real companies/employees:
- **From a MySQL dump** (run on the backend EC2, which can reach RDS):
  ```bash
  mysql -h <RDS_ENDPOINT> -u hrms_admin -p corehrms < your_dump.sql
  ```
- **Or** use the repo's restore/import scripts on the backend EC2 (they read `DATABASE_URL`):
  ```bash
  cd ~/enterprise-hrms/backend
  node scripts/restoreBackupToMysql.js        # full backup restore
  node scripts/importEmployeesFromExcel.js     # Excel roster import
  ```
  💡 These can be finicky with ID formats — do them after the app is confirmed working, and ask for help if a script errors.

---

## Phase 5 — Make it durable

- **Auto-start on reboot:** already done if you ran the `pm2 startup` line + `pm2 save` (backend) and nginx is enabled (frontend, via `systemctl enable nginx` in the setup script). Reboot-test: stop/start the backend EC2, then `pm2 status` shows `hrms-backend` online.
- **Stable IPs (recommended):** allocate an **Elastic IP** for the frontend (so the public website address never changes) and optionally the backend. If you change the frontend IP, update backend `CORS_ORIGIN`; if you change the backend private IP, update the frontend nginx config.

---

## Updating later (your normal workflow)
```bash
# Backend EC2
cd ~/enterprise-hrms && bash deploy/backend/deploy-backend.sh
# Frontend EC2
cd ~/enterprise-hrms && bash deploy/frontend/deploy-frontend.sh
```

## Go-live checklist
- [ ] Security groups: RDS←backend (3306), backend←frontend (5000), frontend←world (80), SSH←My IP
- [ ] Backend `.env` filled; `setup-backend.sh` run; `pm2 startup` line executed
- [ ] `curl .../api/health` → `"database":"connected"`
- [ ] `npm run migrate` seeded a login user
- [ ] Frontend nginx points at backend **private** IP; `setup-frontend.sh` run
- [ ] Backend `CORS_ORIGIN` = frontend public IP; `pm2 reload`
- [ ] `http://<FRONTEND_PUBLIC_IP>/` loads, login works, data persists
- [ ] (Optional) real data imported; Elastic IPs allocated
