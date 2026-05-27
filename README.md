# Chaos Lab - Podman Desktop Extension

Chaos engineering toolkit for Podman Desktop. Inject faults, shape network traffic, limit resources, and isolate containers to test resilience.

## Features

- **Scenario Scheduler** – Create recurring chaos attacks (stop, kill, pause, restart) targeting random, specific, or all containers.
- **Network Shaper** – Inject latency, packet loss, and bandwidth limits into running containers via `tc`.
- **Resource Limiter** – Constrain CPU and memory on the fly with `podman update`.
- **Container Isolator** – Pause containers, disconnect them from networks, or partition them from specific peers.
- **Live Dashboard** – Real-time CPU, memory, network I/O, and block I/O metrics with time-series charts.
- **Safe-list** – Protect critical containers (e.g. `postgres*`, `redis-prod`) from all chaos operations.
- **Tray & Commands** – Quick access via tray menu and command palette (`Stop All Chaos`).

## Architecture

| Package | Description |
|---------|-------------|
| `packages/backend` | Extension entry point, Podman API calls, chaos engine, settings |
| `packages/frontend` | Svelte 5 + TailwindCSS dashboard with @podman-desktop/ui-svelte |
| `packages/shared` | RPC types and message proxy connecting frontend ↔ backend |

## Workshop

This repository doubles as a hands-on workshop for learning the Podman Desktop Extension API. The `workshop/*` branches provide a progressive, step-by-step guide — each branch builds on the previous one by filling in one more TODO placeholder.

### Getting started

```sh
git checkout workshop/01-progress-task   # skeleton with all TODOs
npm install && npm run build
```

Load the extension in Podman Desktop and start filling in the numbered TODOs. Each branch is named after the task you'll implement there — the branch number matches the TODO number. Check your work against the next branch at any time.

### Branch progression

| Branch | TODO | API taught | File |
|--------|------|-----------|------|
| `workshop/01-progress-task` | #1 | `withProgress` | `chaos-api-impl.ts` |
| `workshop/02-status-bar` | #2 | `createStatusBarItem` | `extension.ts` |
| `workshop/03-status-bar-dynamic` | #3 | Dynamic status bar updates via `setInterval` | `extension.ts` |
| `workshop/04-command-stop-all` | #4 | `commands.registerCommand`, `showInformationMessage` | `extension.ts` |
| `workshop/05-command-open-dashboard` | #5 | Command + `panel.reveal()` | `extension.ts` |
| `workshop/06-command-view-container` | #6 | Command + `webview.postMessage` | `extension.ts` |
| `workshop/07-tray-menu` | #7 | `tray.registerMenuItem` with submenu | `extension.ts` |
| `workshop/08-config-change-listener` | #8 | `onDidChangeConfiguration` | `settings-manager.ts` |
| `workshop/09-config-read-values` | #9 | `configuration.getConfiguration` | `settings-manager.ts` |
| `workshop/10-create-provider` | #10 | `provider.createProvider` | `chaos-provider.ts` |
| `workshop/11-connection-factory` | #11 | `setContainerProviderConnectionFactory` | `chaos-provider.ts` |
| `workshop/12-progress-creation` | #12 | `withProgress` in connection factory | `chaos-provider.ts` |
| `workshop/13-ci-workflows` | #13 | CI/CD: nightly + release image builds | `.github/workflows/` |
| `dev_conf` | — | All TODOs completed (final) | — |

### Quick reference

Every workshop branch includes a `SKILL.md` file at the repo root with an API cheat sheet covering common patterns, code snippets, and links to documentation.

## Development

```sh
npm install
npm run build    # or: npm run watch
```

Load the extension in Podman Desktop (v1.17+):

1. Enable **Development Mode** in Settings → Extensions.
2. Go to **Extensions → Local extension** tab.
3. Click **Add a local folder…** and select `packages/backend`.

## Packaging

```sh
podman build -t quay.io/myusername/chaos-lab .
podman push quay.io/myusername/chaos-lab
```

Install via Podman Desktop **Install Custom…** button.

## License

Apache-2.0
