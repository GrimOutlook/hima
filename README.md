# hima

A small, browser-based PPL planner built with React and TypeScript. Create leave pools, add one-time or recurring accruals with optional end dates, including yearly nth-weekday schedules, set date-ranged balance caps, log leave events with hours split across pools for each day, see date-by-date pool usage by event, check your projected balance on any date, and chart the combined balance or a specific pool over the past year and the year ahead.

All amounts are entered in hours. Your pools and events are saved in this browser's local storage. Use **Export JSON** to download a backup or **Import JSON** to restore one; importing replaces the data saved in this browser.

Use the graph's **Show** dropdown to choose which pools appear in the chart. These choices are saved across reloads and included in JSON backups. Selecting an event temporarily shows its pools; clearing the event restores your saved choices.

For holidays, create a pool (for example, **Holidays**) and enable **Holiday Mode** in its pool settings. This applies to the starting balance and new one-time additions or repeating schedules, including a fixed yearly date or an nth weekday each year. Changing the setting leaves existing additions unchanged. Hours can be used on the holiday itself; the unused portion expires the next day. Leave uses expiring hours before regular hours in the same pool. Expiration does not count as leave usage or erase other hours, and lifetime accrued still includes the hours originally added.

## Run locally

Install Node.js 22.13+ and pnpm 12.10.1 (the version declared in `package.json`), then install the dependencies and start the development server. This project uses pnpm; `pnpm-lock.yaml` is the dependency lockfile to keep committed when updating dependencies. The Nix development shell includes both Node.js and pnpm.

TypeScript stays on the latest 6.0 release because `typescript-eslint` does not yet support TypeScript 7.

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Check TypeScript code, React hook dependencies, and JSX accessibility, run the tests, and create a production build with:

```sh
pnpm run lint
pnpm test
pnpm run build
```

The generated site is written to `dist/`. Run `pnpm run preview` to serve the production build locally.

### Build with Nix

With Nix flakes enabled, run `nix build` to build the production site using the pinned Node.js and pnpm dependencies. The static site is available in `result/dist/`, ready to serve with a static web server. Package outputs support `x86_64-linux` and `aarch64-linux`.

Run `nix develop` for the Node.js and pnpm development shell, or `nix run` to start the development server after installing dependencies with `pnpm install --frozen-lockfile`.

When updating `pnpm-lock.yaml`, also update the `pnpmDeps` hash in `flake.nix`: temporarily set it to `pkgs.lib.fakeHash`, run `nix build`, then replace it with the actual hash printed in the hash-mismatch error. New files must be tracked by Git to be included in a local Git-based flake build.

Tests use Node for pure model, settings, and store mutation checks. Component and hook test files opt into jsdom with `@vitest-environment jsdom`. Regression coverage includes fractional-hour balances, shared per-pool history dates, independent graph visibility and total exclusion, modal validation and focus, and calendar selection and keyboard navigation. Run a focused suite with, for example, `pnpm test src/App.test.tsx src/CalendarPicker.test.tsx`.

The app does not need an account or a server. Pools and events are stored in this browser's local storage; existing `hima.store.v1` data is retained and older event formats are migrated when loaded.

Saved planner data and JSON backups carry a numeric `version` (currently `1`). Unversioned data is treated as the legacy schema and migrated to version 1, including older event formats. Unsupported versions are rejected on import; unreadable saved data follows the browser-storage recovery path described by the app.

## License

hima is licensed under the [MIT License](LICENSE). Third-party dependencies, including the bundled fonts, retain their own licenses.
