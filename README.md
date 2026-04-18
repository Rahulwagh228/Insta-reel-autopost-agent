# Insta Agent

Automatically downloads reels from Google Drive, adds a logo watermark, and posts them to Instagram as Reels.

---

## How It Works

```
Google Drive Folder
       │
       ▼
 download-reels.js     ← downloads new .mp4 files to ./downloads
       │
       ▼
   add-logo.js         ← watermarks videos & upscales to 1080x1920 → ./branded
       │
       ▼
post-to-instagram.js   ← starts ngrok tunnel, uploads to Instagram via Graph API
```

Run each script in order, or automate them with a task scheduler.

---

## Prerequisites

- Node.js v18+
- A **Google Cloud** project with a Service Account
- A **Meta Developer** app with Instagram Graph API access
- An **ngrok** account (free tier works)
- Instagram account must be a **Business or Creator** account linked to a Facebook Page

---

## Step 1 — Google Cloud Setup (Service Account)

This lets the script read files from your Google Drive folder without any browser login.

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. In the left menu go to **APIs & Services → Library**
4. Search for **Google Drive API** and click **Enable**
5. Go to **APIs & Services → Credentials**
6. Click **Create Credentials → Service Account**
   - Give it any name (e.g. `insta-agent`)
   - Click **Create and Continue** → skip optional steps → **Done**
7. Click on the service account you just created
8. Go to the **Keys** tab → **Add Key → Create new key → JSON**
9. A `credentials.json` file will download — place it in the project root
10. Copy the service account's email address (looks like `name@project.iam.gserviceaccount.com`)
11. Open your Google Drive folder → **Share** → paste the service account email → give **Viewer** access
12. Copy the folder ID from the Drive URL:
    ```
    https://drive.google.com/drive/folders/THIS_PART_IS_THE_FOLDER_ID
    ```

---

## Step 2 — Meta Developer App Setup (Instagram Access Token)

### 2a. Create a Meta App

1. Go to [https://developers.facebook.com/apps](https://developers.facebook.com/apps)
2. Click **Create App**
3. Select **Business** as the app type → Next
4. Fill in app name and contact email → **Create App**
5. On the dashboard, find **Instagram Graph API** and click **Set Up**

### 2b. Add Instagram Test User / Link your Page

1. Your Instagram account must be set to **Professional (Business or Creator)**
   - Instagram app → Profile → Settings → Account type → Switch to Professional
2. Link it to a **Facebook Page**:
   - Facebook → Pages → Create Page (or use an existing one)
   - Instagram → Settings → Linked Accounts → Facebook → connect your page

### 2c. Get a Short-Lived User Token

1. Go to [https://developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer)
2. Select your app from the top dropdown
3. Click **Generate Access Token** — log in and grant all permissions, especially:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
4. Copy the generated token

### 2d. Exchange for a Long-Lived Page Token (60-day token)

Open this URL in your browser (replace values):

```
https://graph.facebook.com/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id=YOUR_APP_ID
  &client_secret=YOUR_APP_SECRET
  &fb_exchange_token=SHORT_LIVED_TOKEN
```

- **APP_ID** and **APP_SECRET** are in your Meta app dashboard under **Settings → Basic**
- This gives you a long-lived user token (~60 days)

### 2e. Get the Page Access Token

Open in browser:
```
https://graph.facebook.com/me/accounts?access_token=LONG_LIVED_USER_TOKEN
```

Find your page in the response. The `access_token` field for your page is a **never-expiring Page token** — use this as `IG_ACCESS_TOKEN`.

### 2f. Get your Instagram User ID

Open in browser (use the page ID from the previous response):
```
https://graph.facebook.com/YOUR_PAGE_ID?fields=instagram_business_account&access_token=PAGE_ACCESS_TOKEN
```

The `instagram_business_account.id` in the response is your `IG_USER_ID`.

---

## Step 3 — Ngrok Setup

Ngrok creates a temporary public URL so Instagram's servers can download your video from your local machine.

1. Sign up free at [https://ngrok.com](https://ngrok.com)
2. Go to [https://dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)
3. Copy your auth token
4. Add it to `.env` as `NGROK_AUTHTOKEN`

The script starts and stops ngrok automatically — you don't need to run it manually.

---

## Step 4 — Environment Variables

Create a `.env` file in the project root:

```env
# Google Drive
FOLDER_ID=your_google_drive_folder_id
DOWNLOAD_DIR=./downloads
MAX_DOWNLOADS_PER_RUN=3

# Instagram
IG_USER_ID=17841xxxxxxxxx
IG_ACCESS_TOKEN=EAARklst8ZBWw...
DEFAULT_CAPTION=Check this out! #reels

# Ngrok
NGROK_AUTHTOKEN=your_ngrok_auth_token

# Optional
PORT=3000
OUTPUT_DIR=./branded
LOGO_PATH=./logo.jpeg
LOGO_POSITION=bottomright
LOGO_SCALE=120
```

---

## Step 5 — Run

```bash
npm install

# Step 1: Download reels from Google Drive
node download-reels.js

# Step 2: Add logo watermark
node add-logo.js

# Step 3: Post to Instagram
node post-to-instagram.js
```

---

## Project Structure

```
├── download-reels.js      # Downloads .mp4 files from Google Drive
├── add-logo.js            # Adds logo watermark, upscales to 1080x1920
├── post-to-instagram.js   # Posts branded videos to Instagram Reels
├── credentials.json       # Google Service Account key (do not commit)
├── logo.jpeg              # Your watermark/logo image
├── .env                   # Environment variables (do not commit)
├── downloads/             # Raw downloaded videos
├── branded/               # Watermarked videos ready to post
├── processed.json         # Tracks which Drive files were downloaded
└── posted.json            # Tracks which branded files were posted
```

---

## Video Requirements (Instagram Reels)

The `add-logo.js` script automatically handles these:

| Property   | Requirement           |
|------------|-----------------------|
| Codec      | H.264                 |
| Audio      | AAC                   |
| Resolution | Min 500px wide (script outputs 1080x1920) |
| Aspect ratio | 9:16 recommended   |
| Duration   | 3 – 90 seconds        |
| Frame rate | 23 – 60 fps           |

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Object does not exist` (code 100) | Wrong `IG_USER_ID` | Follow Step 2f to get the correct numeric ID |
| `Media upload failed` (code 2207076) | Bad video format or unreachable URL | Re-run `add-logo.js`; check ngrok is running |
| `Missing permissions` | Token doesn't have publish scope | Re-generate token with `instagram_content_publish` permission |
| `credentials.json not found` | Service account key missing | Follow Step 1 to download it |
| `No new branded reels to post` | All files already in `posted.json` | Delete `posted.json` to re-post |
