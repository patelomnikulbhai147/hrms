# Google Maps Setup (Administrator / Installer Guide)

The Google Maps location picker (Company Profile → Address → **Select on Google Map**)
is a **global, installation-wide** feature. It is configured **once** by a Super Admin
(the installer). After that, every company uses it with no further setup — company
users never see API keys, Google Cloud, or any technical configuration.

> This document is for administrators/installers only. It is intentionally **not**
> shown anywhere inside the HRMS application UI.

---

## 1. Create a Google Maps API key

1. Go to the **Google Maps Platform Console** → Credentials:
   https://console.cloud.google.com/google/maps-apis/credentials
2. Create (or select) a project and create an **API key**.
3. Enable these three APIs for the project/key:
   - **Maps JavaScript API**
   - **Places API**
   - **Geocoding API**
4. **Restrict the key** (recommended):
   - Application restriction → **HTTP referrers**, add your HRMS domain(s), e.g.
     `https://hrms.yourcompany.com/*` and, for local testing, `http://localhost:5173/*`.
   - API restriction → limit to the three APIs above.
5. Ensure **billing** is enabled on the Google Cloud project (Google requires it even
   for free-tier usage).

## 2. Configure it in HRMate (recommended)

1. Sign in as **Super Admin**.
2. Open **System Settings → Third Party Integrations → Google Maps**.
3. Paste the API key and click **Save**.
4. Click **Test Connection**. You should see **✓ Google Maps Connected**.

That's it. The key is stored server-side in `backend/data/integrations.json` and is
served to the browser only to load the Google Maps library (secured by the HTTP-referrer
restriction on the key). It is never displayed in the UI.

## 3. Alternative: headless / scripted install

For fully-automated deployments you may instead set an environment variable on the
**backend** before starting it:

```
GOOGLE_MAPS_API_KEY=AIza...your-key...
```

A key saved through System Settings always takes precedence over this env var.

---

## Troubleshooting (admin only)

| Test Connection result | Likely cause / fix |
| --- | --- |
| The API key was rejected by Google | Key is wrong, or Maps JavaScript / Places / Geocoding APIs aren't enabled for it. |
| Quota exceeded or billing not enabled | Enable billing on the Google Cloud project. |
| Could not reach Google | The server has no outbound internet access. |

If a company user reports **"Google Maps is currently unavailable"**, the key is either
missing or failing — re-check the steps above from the Super Admin account.
