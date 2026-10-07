# hima

A small, browser-based PPL planner built with React and TypeScript. Create leave pools, add one-time or recurring accruals with optional end dates, including yearly nth-weekday schedules, set date-ranged balance caps, log leave events with hours split across pools for each day, see your projected balance on any date, and chart the combined balance or a specific pool over the past year and the year ahead.

All amounts are entered in hours. Your pools and events are saved in this browser's local storage. Use **Export JSON** to download a backup or **Import JSON** to restore one; importing replaces the data saved in this browser.

## Run locally

Install Node.js 20 or later, then install the dependencies and start the development server:

```sh
npm install
npm run dev
```

Run the tests and create a production build with:

```sh
npm test
npm run build
```

The generated site is written to `dist/`. Run `npm run preview` to serve the production build locally.

The app does not need an account or a server. Pools and events are stored in this browser's local storage; existing `hima.store.v1` data is retained and older event formats are migrated when loaded.
