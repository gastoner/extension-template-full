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

| Package             | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| `packages/backend`  | Extension entry point, Podman API calls, chaos engine, settings |
| `packages/frontend` | Svelte 5 + TailwindCSS dashboard with @podman-desktop/ui-svelte |
| `packages/shared`   | RPC types and message proxy connecting frontend ↔ backend       |

## Workshop

This repository doubles as a hands-on workshop for learning the Podman Desktop Extension API. The `workshop/*` branches provide a progressive, step-by-step guide — each branch builds on the previous one by filling in one more TODO placeholder.

### Getting started

```sh
git checkout workshop/01-progress-task   # skeleton with all TODOs
npm install && npm run build
```

Load the extension in Podman Desktop and start filling in the numbered TODOs. Each branch is named after the task you'll implement there — the branch number matches the TODO number. Check your work against the next branch at any time.

### Branch progression

| Branch                               | TODO | API taught                                           | File                  |
| ------------------------------------ | ---- | ---------------------------------------------------- | --------------------- |
| `workshop/01-progress-task`          | #1   | `withProgress`                                       | `chaos-api-impl.ts`   |
| `workshop/02-status-bar`             | #2   | `createStatusBarItem`                                | `extension.ts`        |
| `workshop/03-status-bar-dynamic`     | #3   | Dynamic status bar updates via `setInterval`         | `extension.ts`        |
| `workshop/04-command-stop-all`       | #4   | `commands.registerCommand`, `showInformationMessage` | `extension.ts`        |
| `workshop/05-command-open-dashboard` | #5   | Command + `panel.reveal()`                           | `extension.ts`        |
| `workshop/06-command-view-container` | #6   | Command + `webview.postMessage`                      | `extension.ts`        |
| `workshop/07-tray-menu`              | #7   | `tray.registerMenuItem` with submenu                 | `extension.ts`        |
| `workshop/08-config-change-listener` | #8   | `onDidChangeConfiguration`                           | `settings-manager.ts` |
| `workshop/09-config-read-values`     | #9   | `configuration.getConfiguration`                     | `settings-manager.ts` |
| `workshop/10-create-provider`        | #10  | `provider.createProvider`                            | `chaos-provider.ts`   |
| `workshop/11-connection-factory`     | #11  | `setContainerProviderConnectionFactory`              | `chaos-provider.ts`   |
| `workshop/12-ci-workflows`           | #12  | CI/CD: nightly + release image builds                | `.github/workflows/`  |
| `workshop/13-onboarding`             | #13  | `context.setValue` + onboarding workflow             | `chaos-provider.ts`   |
| `workshop/14-cli-tool`               | #14  | `cli.createCliTool`                                  | `extension.ts`        |
| `dev_conf`                           | —    | All TODOs completed (final)                          | —                     |

### Quick reference

Every workshop branch includes a `SKILL.md` file at the repo root with an API cheat sheet covering common patterns, code snippets, and links to documentation.

## Development of the extension against production Podman Desktop (1.27.2)

In the extension's root folder:

```sh
npm install
npm run build    # or: npm run watch
```

Download Podman Desktop ([github podman-desktop releases](https://github.com/podman-desktop/podman-desktop/releases/tag/v1.27.2)) and install it.

Load the extension within Podman Desktop:

We will load the extension within Podman Desktop to test it. This requires Podman Desktop v1.17+ installed locally.

1. Navigate to the settings and enable `Development Mode` for the `extensions`
2. Click on the `extensions` nav item in the left navigation bar
3. Go to the `Local extension` tab.
4. Click on the 'Add a local folder...' button and select the path of the `packages/backend` folder of this extension and click OK.
5. Now the extension is part of Podman Desktop and you can see it listed in the `installed` tab of the Extensions panel.

6. Confirm that the extension has been loaded:

You will now see a "Hello World" or "ChaosLab" (depends on the branch/state of the repository) webview in the Podman Desktop navbar. You can also check the developer console for any logging information indicating that the extension has been loaded successfully.

Example of extension loading:

![loaded](/images/loaded.png)

## Alternative Development method: Extension development againts development version of Podman Desktop (nightly) with Auto Reload

Prerequisities: Nodejs v24.15.0, npm and pnpm!

```sh
npm install -g pnpm@10
```

Checkout the podman-desktop repository, install dependencies

```sh
git clone https://github.com/podman-desktop/podman-desktop.git
cd podman-desktop
pnpm install
```

And run the podman-desktop in the watch mode with a link to extension's folder (so we can enable auto-reload)

```sh
# in podman-desktop root folder
pnpm watch --extension-folder ~/git/extension-template-full/packages/backend/
```

Run the extension in the watch mode

```sh
cd extension-template-full
npm install
npm run watch
```

Enjoy auto-reload of the changes done on the extension's side in the running instance of the Podman Desktop.

## Linter, Typecheck, Formatter and unit tests

We include additional tools to assist in development, which can be found in the main `package.json` file.

Formatter:

```sh
$ npm run format:fix
```

Linter:

```sh
$ npm run lint:fix
```

Typechecker:

```sh
$ npm run typecheck
```

Unit tests:

```sh
$ npm run test
```

## Packaging the extension as an OCI image

The multistage Containerfile for packaging the Podman Desktop extension as ac OCI image. The first stage is to prepare the builder image, where we copy the content of the extension and use image's prepared node/npm to install dependencies and build it.

The second stage then copies the content of the extension from previous step into **scratch** image and so the result image contains only the necessary files and proper image metadata.

```yaml
FROM node:24-slim AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

COPY . /app
WORKDIR /app
RUN npm install
RUN npm run build

FROM scratch

COPY --from=builder /app/packages/backend/dist/ /extension/dist
COPY --from=builder /app/packages/backend/package.json /extension/
COPY --from=builder /app/packages/backend/media/ /extension/media
COPY --from=builder /app/LICENSE /extension/
COPY --from=builder /app/packages/backend/icon.png /extension/
COPY --from=builder /app/README.md /extension/

LABEL org.opencontainers.image.title="Podman Desktop Chaos Lab Extension" \
org.opencontainers.image.description="Containers durability harness tool" \
org.opencontainers.image.vendor="DevConf Podman Desktop / Extension demo" \
io.podman-desktop.api.version=">= 1.22.0"
```

Build the extension image

```sh
podman build -t chaos-lab .
```

## Using packed extension from OCI image in local Podman Desktop

We can elevate the knowledge of the Podman Desktop internals to install the extension from the OCI image that exists locally for now. This is a great approach for catch possible build/deps problems we may have when developing the extension.

We will use Podman Desktop Home configuration folder for the data, usually `~/.local/share/containers/podman-desktop/`, there is a `plugins` folder, it is a place where all external extensions are installed. So if we can get an extension's OCI image file system and copy it there, the extension would become available in the Podman Desktop.

Note: the configuration settings exists under `~/.config/containers/podman-desktop/`.

```sh
# directly use Podman Desktop Home Data Configuration folder
pluginsFolder=~/.local/share/containers/podman-desktop/plugins/
mkdir -p $pluginsFolder
# build the image using Containerfile
podman build -t chaos-lab ./ -f ./Containerfile
# create a container to access extension's file system
CONTAINER_ID=$(podman create localhost/chaos-lab --entrypoint "")
# store the image file system into archive and extract it into correct location
podman export $CONTAINER_ID | tar -x -C $pluginsFolder
# renaming for better readability
mv $pluginsFolder/extension $pluginsFolder/chaoslab-extension
# remove container and image
podman rm -f $CONTAINER_ID
podman rmi -f localhost/chaos-lab:latest
```

Now if we start Podman Desktop, we should see the Chaos Lab extension installed in the navigation bar.

## Publishing from Local Machine

More information on how to package and publish your extension can be found in our [official publishing documentation](https://podman-desktop.io/docs/extensions/publish).

1. Package your extension by building the image using the Containerfile from extension's repository:

```sh
$ podman build -t quay.io/myusername/myextension .
```

2. Log into container registry (ie. quay.io)

```sh
podman login quay.io
```

3. Push the extension to an external registry:

```sh
$ podman push quay.io/myusername/myextension
```

4. Install via the Podman Desktop "Install Custom..." button, which uses URL tag of the OCI image repository: `quay.io/myusername/myextension` (format: `ghcr.io/my-org/custom-extension:v1.0`).

![custom install](/images/custom_install.png)

## Enabling the GitHub CI system to speed up changes feedback loop

### Pull Request check workflow yaml file

1. Standard event trigger definition for GH actions workflows:

```yaml
name: pr-check

on: [pull_request]

jobs: ...
```

2. Install deps, build, lint, format and unit tests run

```yaml
jobs:
  lint-format-unit:
    name: linter, formatter, and tests / ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    timeout-minutes: 15
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-24.04]
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: 'npm'

      - name: Execute npm
        run: npm install

      - name: Run linter
        run: npm run lint:check

        # skip formatter on windows
      - name: Run formatter
        if: ${{ matrix.os=='ubuntu-22.04' }}
        run: npm run format:check

      - name: Run tests
        run: npm run test

      - name: Run typecheck
        run: npm run typecheck

      - name: Run build
        run: npm run build
```

3. Image builder step

```yaml
# Dedicated step to build the chaos lab extension image
build-container:
  name: Build Extension Image
  runs-on: ubuntu-24.04
  steps:
    - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

    - name: Build Image and Extract Files
      id: build-image
      run: |
        podman build -t local_image ./
        CONTAINER_ID=$(podman create localhost/local_image --entrypoint "")
        mkdir -p output/plugins
        podman export $CONTAINER_ID | tar -x -C output/plugins/
        podman rm -f $CONTAINER_ID
        podman rmi -f localhost/local_image:latest
```

### Build Next/CI for nightly extension OCI image on ghcr.io

### E2E Tests on PR check

## License

Apache License 2.0
