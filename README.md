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

This repository doubles as a hands-on workshop for learning the Podman Desktop Extension API. The `workshop/*` branches provide a progressive, step-by-step guide — each branch builds on the previous one by filling in one more TODO placeholder.

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
