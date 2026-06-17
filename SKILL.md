# Podman Desktop Extension — Quick Reference

Common API patterns for building Podman Desktop extensions. Use this as a cheat sheet when filling in the workshop TODOs.

## Common API patterns

| Task                            | API                                                                   |
| ------------------------------- | --------------------------------------------------------------------- |
| Show info/warning/error message | `extensionApi.window.showInformationMessage(msg)`                     |
| Register a command              | `extensionApi.commands.registerCommand(id, callback)`                 |
| Create a provider               | `extensionApi.provider.createProvider(options)`                       |
| Create a webview                | `extensionApi.window.createWebviewPanel(viewType, title, options)`    |
| Send message to webview         | `panel.webview.postMessage(data)`                                     |
| Receive message from webview    | `panel.webview.onDidReceiveMessage(callback)`                         |
| Add status bar item             | `extensionApi.window.createStatusBarItem()`                           |
| Add tray menu item              | `extensionApi.tray.registerMenuItem(item)`                            |
| Read configuration              | `extensionApi.configuration.getConfiguration(section)`                |
| Listen for config changes       | `extensionApi.configuration.onDidChangeConfiguration(callback)`       |
| Show progress task              | `extensionApi.window.withProgress({ location, title }, callback)`     |
| Pull a container image          | `extensionApi.containerEngine.pullImage(connection, image, callback)` |
| Create a container              | `extensionApi.containerEngine.createContainer(engineId, options)`     |
| Start/stop a container          | `extensionApi.containerEngine.startContainer(engineId, id)`           |
| List containers                 | `extensionApi.containerEngine.listContainers()`                       |
| Get running engine connection   | `extensionApi.provider.getContainerConnections()`                     |
| Navigate to webview             | `extensionApi.navigation.navigateToWebview(webviewId)`                |

## Status bar item

```ts
const statusBar = extensionApi.window.createStatusBarItem();
statusBar.text = 'My Extension';
statusBar.command = 'my-extension.openDashboard';
statusBar.show();
extensionContext.subscriptions.push(statusBar);
```

## Registering a command

```ts
const cmd = extensionApi.commands.registerCommand('my-extension.doSomething', async () => {
  await extensionApi.window.showInformationMessage('Done!');
});
extensionContext.subscriptions.push(cmd);
```

## Tray menu

```ts
const tray = extensionApi.tray.registerMenuItem({
  id: 'my-extension.tray',
  type: 'submenu',
  label: 'My Extension',
  submenu: [
    { id: 'my-extension.openDashboard', label: 'Open Dashboard' },
    { id: 'my-extension.doSomething', label: 'Do Something' },
  ],
});
extensionContext.subscriptions.push(tray);
```

## Reading configuration

```ts
const config = extensionApi.configuration.getConfiguration('my-extension');
const value = config.get<string>('someKey') ?? 'default';
```

## Listening for configuration changes

```ts
const disposable = extensionApi.configuration.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('my-extension')) {
    // Reload configuration values
  }
});
extensionContext.subscriptions.push(disposable);
```

## Creating a provider

```ts
const provider = extensionApi.provider.createProvider({
  id: 'my-provider',
  name: 'My Provider',
  status: 'unknown',
  version: '1.0.0',
  images: {
    icon: './icon.png',
    logo: { dark: './icon.png', light: './icon.png' },
  },
  emptyConnectionMarkdownDescription: 'No connections. Click **Create** to add one.',
});
extensionContext.subscriptions.push(provider);
```

## Connection factory

```ts
provider.setContainerProviderConnectionFactory({
  creationDisplayName: 'My Machine',
  creationButtonTitle: 'Create Machine',
  create: async (params, logger, token) => {
    const name = params['my-provider.factory.name'] ?? 'default';
    logger?.log(`Creating ${name}...`);
    // ... creation logic
    provider.updateStatus('ready');
  },
});
```

## Progress task (Task Widget)

```ts
await extensionApi.window.withProgress(
  { location: extensionApi.ProgressLocation.TASK_WIDGET, title: 'My Operation' },
  async progress => {
    progress.report({ message: 'Starting...' });
    await doWork();
    progress.report({ increment: 100, message: 'Complete' });
  },
);
```

## Webview messaging (backend → frontend)

```ts
// Backend: send message to webview
await panel.webview.postMessage({ type: 'navigate', url: '/some/page' });

// Frontend: listen for messages
window.addEventListener('message', (event: MessageEvent) => {
  if (event.data?.type === 'navigate') {
    // handle navigation
  }
});
```

## Extension lifecycle

```ts
export async function activate(extensionContext: ExtensionContext): Promise<void> {
  // Register commands, providers, status bar items, etc.
  // Push disposables to extensionContext.subscriptions for cleanup
}

export async function deactivate(): Promise<void> {
  // Clean up resources not handled by subscriptions
}
```

## Resources

- [Extension API types](https://github.com/podman-desktop/podman-desktop/blob/main/packages/extension-api/src/extension-api.d.ts)
- [Full template (Svelte + multi-package)](https://github.com/podman-desktop/podman-desktop-extension-full-template)
- [Minimal template](https://github.com/podman-desktop/podman-desktop-extension-minimal-template)
- [Podman Desktop docs](https://podman-desktop.io/docs/extensions)
