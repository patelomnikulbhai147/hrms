# RDS MySQL — Complete Setup Guide (beginner, for this HRMS app)

This creates the **database server** (AWS RDS for MySQL) that your backend EC2 connects to. The app's Prisma schema is MySQL, so this maps 1:1.

> ⚠️ **Size names differ from EC2.** RDS classes start with **`db.`** — `t3.small` (your EC2) does **not** exist in RDS. For the database pick **`db.t3.micro`** (or `db.t4g.micro`). You never install MySQL on the EC2; it lives only here.

**Exact values you'll set (memorize these):**

| Field | Value |
|---|---|
| Engine | **MySQL 8.0** (latest minor) |
| DB instance identifier | `hrms-db` |
| Master username | `hrms_admin` |
| Master password | a strong one — **write it down** |
| Instance class | `db.t3.micro` (free tier) |
| Storage | 20 GiB, gp3 |
| Public access | **No** |
| Initial database name | `corehrms` |
| Security group | `hrms-rds-sg` (inbound 3306 from `hrms-backend-sg`) |

---

## 1. Open the create wizard
1. AWS Console → top-right **Region** must match your EC2 (e.g. **ap-south-1 Mumbai**).
2. Search bar → **RDS** → left menu **Databases** → **Create database**.
3. **Choose a database creation method** → **Standard create** (not Easy create — you want control).

## 2. Engine
4. **Engine type** → **MySQL**.
5. **Engine version** → leave the **default latest MySQL 8.0.x**. 💡 If a later step says your instance class "is not supported for this engine version," it's almost always an old version — staying on the latest 8.0 fixes it.

## 3. Template
6. **Templates** → **Free tier**. 💡 This auto-limits you to free, supported settings (single-AZ, `db.t3.micro`) so you can't accidentally pick a paid combo. (Choose **Dev/Test** only if Free tier is exhausted/unavailable.)

## 4. Settings (names & password)
7. **DB instance identifier:** `hrms-db` (this is just the AWS resource name).
8. **Master username:** `hrms_admin`.
9. **Credentials management** → **Self managed** → **Master password:** type a strong password and confirm it.
   - ✍️ **Save it now.** You'll paste it into `backend/.env`.
   - 💡 Avoid `@ : / # %` if you can — if your password has them, you must URL-encode them in the connection string later (`@`→`%40`, `:`→`%3A`, `/`→`%2F`, `#`→`%23`). A long letters+digits password avoids the hassle.

## 5. Instance class
10. **Instance configuration** → **DB instance class** → **`db.t3.micro`**.
    - If it's greyed out / unsupported, pick **`db.t4g.micro`** (ARM/Graviton equivalent — works identically for you and is the free default in many regions).

## 6. Storage
11. **Storage type:** General Purpose SSD **(gp3)**.
12. **Allocated storage:** `20` GiB.
13. **Storage autoscaling:** you can untick **Enable storage autoscaling** to avoid surprise growth (optional; leaving it on is also fine).

## 7. Connectivity (the important part)
14. **Compute resource** → **Don't connect to an EC2 compute resource** (we'll wire the firewall manually — more reliable).
    - 💡 *Shortcut alternative:* choosing **Connect to an EC2 compute resource → hrms-backend** auto-creates the security-group rules for you. It works, but it sometimes spawns extra auto-named SGs. The manual way below is cleaner.
15. **Virtual private cloud (VPC):** the **same VPC** as your backend EC2 (the **Default VPC** unless you made another).
16. **Public access:** **No.** 💡 The DB must never be on the public internet — only your backend EC2 (inside the VPC) talks to it.
17. **VPC security group (firewall):** → **Create new** → name it **`hrms-rds-sg`**.
    - (We'll fix its inbound rule right after creation in Step 11 — the wizard can't reference another SG cleanly here.)
18. **Availability Zone:** No preference.
19. **Database port:** leave **3306**.

## 8. Authentication
20. **Database authentication:** **Password authentication**.

## 9. Additional configuration (don't skip — this creates the DB!)
21. Expand **Additional configuration**.
22. **Initial database name:** `corehrms`. ⚠️ **If you leave this blank, no database is created** and the app can't connect. Type exactly `corehrms`.
23. **Backups:** keep **Enable automated backups**, retention **7 days** (good safety net).
24. Leave encryption, monitoring, maintenance at defaults.

## 10. Create
25. Scroll down → **Create database**. (If a popup offers to manage the password in Secrets Manager, you can **Close** it — you chose self-managed.)
26. Status shows **Creating** → wait ~5–10 min until **Available**.

## 11. Lock the firewall to the backend (after it's Available)
The DB's SG must allow MySQL **only from your backend EC2's security group**.
1. RDS → **Databases** → click **hrms-db** → **Connectivity & security** tab → under **Security** click the **`hrms-rds-sg`** link (opens EC2 Security Groups).
2. **Inbound rules** tab → **Edit inbound rules** → **Add rule**:
   - **Type:** **MYSQL/Aurora** (auto-fills port **3306**)
   - **Source:** **Custom** → type and select **`hrms-backend-sg`**
   - Remove any other inbound rule (e.g. an auto-added "My IP" one) unless you specifically want to connect a DB tool from your laptop.
3. **Save rules.**
   - 💡 Using the *security group* as the source (not an IP) means it keeps working even when instance IPs change.

## 12. Get the Endpoint → build your connection string
1. RDS → **hrms-db** → **Connectivity & security** → copy the **Endpoint** (e.g. `hrms-db.abcd1234.ap-south-1.rds.amazonaws.com`).
2. Your `DATABASE_URL` for `backend/.env` (Step 5b of the backend guide):
   ```
   DATABASE_URL="mysql://hrms_admin:YOUR_ENCODED_PASSWORD@hrms-db.abcd1234.ap-south-1.rds.amazonaws.com:3306/corehrms?connection_limit=5"
   ```
   - user `hrms_admin`, your (URL-encoded) password, the **Endpoint**, port `3306`, db `corehrms`.

## 13. Verify (from the backend EC2)
Because **Public access = No**, you test connectivity **from the backend EC2**, not your laptop. After putting `DATABASE_URL` in `backend/.env` and running `setup-backend.sh`:
```bash
curl http://localhost:5000/api/health
```
- `"database":"connected"` ✅ — the backend reached RDS.
- `"database":"disconnected"` (503) ❌ — re-check the steps below.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Class "not supported for engine version" | Use **MySQL 8.0 latest** + **db.t3.micro** (or `db.t4g.micro`). |
| `db.t3.micro` greyed out | Pick **db.t4g.micro**; or ensure **Free tier** template is selected. |
| App: `database":"disconnected"` / `prisma migrate deploy` hangs | `hrms-rds-sg` must allow **3306 from `hrms-backend-sg`**; backend EC2 + RDS must be in the **same VPC**. |
| `Access denied for user 'hrms_admin'` | Password wrong **or** not URL-encoded in `DATABASE_URL` (encode `@ : / #`). |
| `Unknown database 'corehrms'` | You skipped **Initial database name**. Create the DB once: from the backend EC2 run `mysql -h <endpoint> -u hrms_admin -p -e "CREATE DATABASE corehrms;"` then re-run migrations. |
| Can't connect from my laptop | Expected — Public access is No. Connect from the backend EC2, or temporarily add your **My IP** to `hrms-rds-sg` (then remove it). |

## Checklist
- [ ] Same Region/VPC as the backend EC2
- [ ] MySQL 8.0, **db.t3.micro**/`db.t4g.micro`, 20 GiB gp3
- [ ] Master user `hrms_admin`, password saved
- [ ] **Public access No**
- [ ] **Initial database name `corehrms`** set
- [ ] `hrms-rds-sg` inbound: **3306 from `hrms-backend-sg`** only
- [ ] Endpoint copied into `backend/.env` `DATABASE_URL`
- [ ] `curl .../api/health` → `"database":"connected"`
