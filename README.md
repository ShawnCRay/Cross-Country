# XC Tracker

A cross country season tracker for coaches. Runs entirely in the browser, no server or account needed, and works well on a phone at the finish line.

## What it does

- **Race stopwatch**: start one clock for the race, then tap each runner's name as they cross the line. The clock keeps running. If you miss who it was, hit the big FINISH button and assign the name afterward. Times can be edited, finishes undone, and the clock survives a page refresh. Save writes the results straight into the race.
- **Practices**: log four kinds of workouts and enter a result for every runner on the roster.
  - Timed run (run for 12 minutes, record miles covered)
  - Timed distance (timed mile, timed 2 mile, etc.)
  - Intervals / repeats (record every split, see the average)
  - Distance run (miles and optional time)
- **Runners**: roster per season with boys / girls teams and grade. Each runner page shows race PBs by distance, timed mile PB, best timed run distance, best interval average, season mileage, progress charts, and full race and practice history. PBs are flagged automatically on race and practice results.
- **Races**: results table with team place, pace, overall place, PB badges, and a top-5 average and 1-5 spread per team.
- **Seasons**: create a new season each year. Runners carry over, so their PBs and history follow them.
- **Backup**: export everything to a JSON file and import it on another device.

## Running it

```bash
npm install
npm run dev      # local dev server
npm run build    # production build in dist/
npm run preview  # serve the production build
```

The build uses a relative base path, so `dist/` can be dropped onto any static host (GitHub Pages, Netlify, a school web server, or even opened from a folder).

## Where the data lives

Out of the box, data is stored in the browser on the device you use. Export a backup from Settings to move it. The backup file is plain JSON.

## Sync across devices and a read-only view for parents

Turn on sync and the phone, the laptop, and everyone with the link see the same data. Coaches sign in with Google to edit; everyone else sees a read-only view. Writes queue while offline and send when signal returns.

It uses Firebase (free tier is plenty for a team). One-time setup, about ten minutes:

1. Go to https://console.firebase.google.com, click **Add project**, name it, and finish (Analytics can be off).
2. **Build → Firestore Database → Create database.** Pick a location, start in **production mode**.
3. On the Firestore **Rules** tab, paste the contents of `firestore.rules` from this repo, replace `coach@example.com` with the coach's Google email (add more, comma separated, for assistant coaches), and click **Publish**.
4. **Build → Authentication → Get started → Sign-in method → Google → Enable**, then Save.
5. On the Authentication **Settings → Authorized domains** tab, add the domain the site is served from (for GitHub Pages that is `<your-username>.github.io`).
6. **Project settings (gear icon) → Your apps → Web (</> icon)**, register the app, and copy the `firebaseConfig` object it shows.
7. In `src/firebase-config.ts`, paste that object as `firebaseConfig` and put the same coach emails from step 3 in `editorEmails`. Commit and push.

The web config is safe to commit; the Firestore rules are what control access. Once deployed, the first coach to sign in on a device that already has data pushes that data up, and every other device picks it up.

## Tech

Vite, React, TypeScript, react-router. No other runtime dependencies.
