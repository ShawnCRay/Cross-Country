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

The site is served by a Cloudflare Worker with a D1 (SQLite) database behind it:

- **Live site:** https://xc-tracker.shawn-7b3.workers.dev/
- Every device that opens it sees the same data. Anyone with the link can view.
- Only someone who has entered the **coach passcode** on their device can edit. Tap "Coach sign in" in the header. The passcode is remembered on that device until you sign out.
- Works offline once a device has synced: edits queue and send when the connection returns. The stopwatch never needs a connection.
- Each browser also keeps a local copy, and Settings has a JSON export for backups.

If the static build is hosted somewhere without the API (for example plain GitHub Pages), the app detects that and runs local-only.

## Deploying

```bash
npm run build
npx wrangler deploy                 # needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
```

Pushes to `main` also deploy automatically if the repo has `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

Change or add coach passcodes (comma separated for more than one):

```bash
printf 'new-passcode' | npx wrangler secret put COACH_KEY
```

The database schema is in `worker/schema.sql`; apply it to a new database with `npx wrangler d1 execute xc-tracker --remote --file worker/schema.sql`.

## Tech

Vite, React, TypeScript, react-router on the front end. Cloudflare Worker + D1 for the API, code in `worker/`.
