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

All data is stored in the browser's localStorage on the device you use. There is no sync between devices, so export a backup from Settings after race day and whenever you switch phones or laptops. The backup file is plain JSON.

## Tech

Vite, React, TypeScript, react-router. No other runtime dependencies.
