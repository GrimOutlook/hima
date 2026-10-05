# hima

A small, browser-based PPL planner built with Dioxus. Create leave pools, add one-time or recurring accruals, log events against a pool, and see your projected balance on any date.

All amounts are entered in hours. Your pools and events are saved in this browser's local storage.

## Run with Nix

Enter the development shell, then start the app with live reload:

```sh
nix develop
dx serve --platform web
```

You can also run `nix run .` to launch the development server directly. Build a production web app with:

```sh
dx build --platform web --release
```

## Run without Nix

Install Rust 1.83 or later and the Dioxus CLI, then run `dx serve --platform web` from this directory. The app does not need an account or a server.
