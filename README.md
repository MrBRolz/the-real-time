# TempoTrack - Freelance Time & Productivity Tracker

TempoTrack is a premium, client-side, zero-cost time-tracking web application designed for freelancers, contract workers, and part-time staff. Built using standard modern web technologies (HTML5, Vanilla CSS3, and JavaScript) and optimized for completely free-tier hosting (specifically Vercel, Netlify, and GitHub Pages). 

All logs are stored safely and privately in your browser's local storage—making the app 100% serverless, zero-cost, and private.

## Key Features

- **Dual-Mode Time Tracking**:
  - *Real-Time Timer*: Active check-in/check-out stopwatch that ticks in real-time. The active state automatically persists in `localStorage` so you can close the browser or refresh without losing your running timer.
  - *Manual Time Logging*: Quickly add historical work hours with custom dates, start/end times, and note descriptions.
- **Responsive Dashboard Metrics**:
  - Tracks total hours dynamically for: **Today**, **This Week** (Monday-Sunday), **This Month** (automatically resets to zero when a new month begins, while preserving all past history), and **This Year**.
- **Interactive Analytics**:
  - Interactive 12-month annual bar chart powered by Chart.js.
  - Detailed month-by-month breakdown table showing total hours and percentage of annual capacity.
- **Log Management**:
  - Browse history records with dedicated **Month** and **Year** filters.
  - Full Edit and Delete operations for any past record (modifying times automatically recalculates durations and updates metrics immediately).
- **Data Portability**:
  - Export logs as **CSV** (for direct import into spreadsheet apps like Excel or Google Sheets).
  - Export/Backup logs as **JSON**.
  - Import/Restore logs from a **JSON** backup.
- **Premium Aesthetics**:
  - Smooth light/dark theme toggling.
  - Glassmorphic card styling, responsive layouts, micro-animations, and fluid transitions.
- **Zero-Config Cloud Sync**:
  - Pair and synchronize logs between your phone, tablet, and Mac by entering a matching private sync passphrase in the sidebar settings. No backend databases or user account signups required.

---

## Local Development & Running the App

Since TempoTrack is a client-side Single Page Application (SPA), it requires no installation, compile steps, or build runs!

### Option A: Direct Open (Easiest)
Simply open the [index.html](file:///Users/admin/Documents/antigravity/peaceful-mendel/index.html) file directly in any modern web browser.

### Option B: Local Server (Recommended for full feature support)
Run a local development server for testing. You can run one of the following:

- **Using Node.js**:
  ```bash
  npx serve
  ```
- **Using Python**:
  ```bash
  python -m http.server 8000
  ```
Then open your browser to `http://localhost:3000` (Node) or `http://localhost:8000` (Python).

---

## Step-by-Step Deployment Guide (100% Free Hosting)

### 🚀 Deploying to Vercel (Recommended)

Vercel offers the fastest, most reliable free tier for static sites with global CDN, custom domain support, and SSL.

#### Method 1: Vercel Dashboard (Zero Commands)
1. Push your code to a repository on **GitHub**, **GitLab**, or **Bitbucket**.
2. Go to [Vercel](https://vercel.com/) and log in (or sign up for a free Hobby account).
3. Click **Add New** -> **Project**.
4. Import your Git repository.
5. In the **Configure Project** step:
   - Leave the **Framework Preset** as **Other**.
   - Keep the **Build and Output Settings** defaults (since it is static HTML, no build command is needed).
6. Click **Deploy**. Your site will be live on a secure `vercel.app` subdomain in under a minute!

#### Method 2: Vercel CLI (From your Terminal)
1. Install Vercel CLI globally:
   ```bash
   npm install -g vercel
   ```
2. Run the deployment command inside the project directory:
   ```bash
   vercel
   ```
3. Log in if prompted, select your scope, and link the project.
4. Set the settings to default (just press Enter for all prompts).
5. Once staging is verified, deploy to production:
   ```bash
   vercel --prod
   ```

---

### 🌐 Deploying to Netlify (Alternative)

Netlify is another excellent free host for static sites, providing instant deployments.

#### Method 1: Netlify Drag & Drop (No Git required)
1. Go to [Netlify App Drop](https://app.netlify.com/drop).
2. Drag and drop the `website.zip` file (located in the project folder) directly into the browser upload box.
3. Within seconds, Netlify will publish your site and provide a live URL!

---

#### Method 2: Git Integration
1. Push your code to GitHub.
2. Sign in to [Netlify](https://www.netlify.com/) and select **Add new site** -> **Import an existing project**.
3. Choose GitHub, authorize Netlify, and select your repository.
4. Leave build settings blank and click **Deploy Site**.

---

### 🐙 Deploying to GitHub Pages (Alternative)

You can host TempoTrack directly from your GitHub repository for free.

1. Create a repository on GitHub and push your files.
2. Navigate to the repository settings on GitHub.
3. In the sidebar, select **Pages**.
4. Under **Build and deployment** -> **Source**, select **Deploy from a branch**.
5. Under **Branch**, select `main` (or your default branch) and select `/ (root)` folder.
6. Click **Save**.
7. Wait a few minutes, and GitHub will provide a deployment link (e.g., `https://yourusername.github.io/repositoryname`).
