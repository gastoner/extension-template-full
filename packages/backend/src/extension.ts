/**********************************************************************
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import type { ExtensionContext } from '@podman-desktop/api';
import * as extensionApi from '@podman-desktop/api';
import fs from 'node:fs';
import { RpcExtension } from '/@shared/src/messages/MessageProxy';
import { ContainerService } from './container-service';
import { ChaosEngine } from './chaos/chaos-engine';
import { ChaosApiImpl } from './chaos/chaos-api-impl';
import { SettingsManager } from './settings-manager';
import { registerChaosProvider, disposeChaosProvider } from './chaos-provider';

let chaosEngine: ChaosEngine | undefined;
let statusBarUpdateInterval: ReturnType<typeof setInterval> | undefined;

export async function activate(extensionContext: ExtensionContext): Promise<void> {
  console.log('Starting Chaos Lab extension');

  const settingsManager = new SettingsManager();
  settingsManager.load();
  extensionContext.subscriptions.push({ dispose: () => settingsManager.dispose() });

  const settings = settingsManager.getSettings();

  const containerService = new ContainerService();

  chaosEngine = new ChaosEngine(containerService);
  chaosEngine.setSafePatterns(settings.chaosSafeContainers);
  extensionContext.subscriptions.push({ dispose: () => chaosEngine?.dispose() });

  const chaosApiImpl = new ChaosApiImpl(chaosEngine, containerService);

  const panel = extensionApi.window.createWebviewPanel('chaos-lab', 'Chaos Lab', {
    localResourceRoots: [extensionApi.Uri.joinPath(extensionContext.extensionUri, 'media')],
  });
  extensionContext.subscriptions.push(panel);

  const indexHtmlUri = extensionApi.Uri.joinPath(extensionContext.extensionUri, 'media', 'index.html');
  const indexHtmlPath = indexHtmlUri.fsPath;
  let indexHtml = await fs.promises.readFile(indexHtmlPath, 'utf8');

  const scriptLink = indexHtml.match(/<script.*?src="(.*?)".*?>/g);
  if (scriptLink) {
    scriptLink.forEach(link => {
      const src = link.match(/src="(.*?)"/);
      if (src) {
        const webviewUri = panel.webview.asWebviewUri(
          extensionApi.Uri.joinPath(extensionContext.extensionUri, 'media', src[1]),
        );
        indexHtml = indexHtml.replace(src[1], webviewUri.toString());
      }
    });
  }

  const cssLink = indexHtml.match(/<link.*?href="(.*?)".*?>/g);
  if (cssLink) {
    cssLink.forEach(link => {
      const href = link.match(/href="(.*?)"/);
      if (href) {
        const webviewUri = panel.webview.asWebviewUri(
          extensionApi.Uri.joinPath(extensionContext.extensionUri, 'media', href[1]),
        );
        indexHtml = indexHtml.replace(href[1], webviewUri.toString());
      }
    });
  }

  panel.webview.html = indexHtml;

  const rpcExtension = new RpcExtension(panel.webview);
  rpcExtension.registerInstance<ChaosApiImpl>(ChaosApiImpl, chaosApiImpl);

  settingsManager.onSettingsChanged(newSettings => {
    chaosEngine?.setSafePatterns(newSettings.chaosSafeContainers);

    if (chaosStatusBar) {
      if (newSettings.showStatusBarChaos) {
        chaosStatusBar.show();
      } else {
        chaosStatusBar.hide();
      }
    }
  });

  // ---------------------------------------------------------------------------
  // #1: Show a toast notification and a progress task
  // A) Show an information message to the user:
  //      'Chaos Lab extension has been activated. Open the dashboard to get started.'
  //    Hint: extensionApi.window.showInformationMessage(text)
  //
  // B) Open chaos-api-impl.ts and wrap stopAllChaos() in a progress task:
  //      extensionApi.window.withProgress({ location, title }, async (progress) => { ... })
  //    See the #1 TODO there for details.
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // #2: Create a status bar item
  // Create a status bar item that displays "Chaos Lab" as its text.
  // Set its .command to 'chaos-lab.openChaos' so clicking it opens the dashboard.
  // Call .show() to make it visible (respecting settings.showStatusBarChaos).
  // Push it to extensionContext.subscriptions for proper disposal.
  // Hint: extensionApi.window.createStatusBarItem()
  // ---------------------------------------------------------------------------
  const chaosStatusBar = undefined as any; // replace with real implementation

  // ---------------------------------------------------------------------------
  // #3: Dynamically update the status bar text
  // Set up a setInterval (every 3 seconds) that reads chaosEngine.getState()
  // and updates chaosStatusBar.text:
  //   - When runningAttacks > 0 → "Chaos Lab (N active)"
  //   - Otherwise → "Chaos Lab"
  // Store the interval handle in statusBarUpdateInterval.
  // Push a disposable to extensionContext.subscriptions that clears the interval.
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // #4: Register the "Stop All Chaos" command
  // Register a command 'chaos-lab.stopAll' that:
  //   1. Calls chaosApiImpl.stopAllChaos()
  //   2. Shows a toast notification: 'All chaos operations have been stopped and rolled back.'
  // Push the returned disposable to extensionContext.subscriptions.
  // Hint: extensionApi.commands.registerCommand(id, callback)
  // Hint: extensionApi.window.showInformationMessage(text)
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // #5: Register the "Open Dashboard" command
  // Register a command 'chaos-lab.openChaos' that calls panel.reveal()
  // to bring the webview panel to the foreground.
  // Push the returned disposable to extensionContext.subscriptions.
  // Hint: extensionApi.commands.registerCommand(id, callback)
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // #6: Register the "View Container" command with webview messaging
  // Register a command 'chaos-lab.viewContainerUsage' that receives a container
  // object ({ id?: string; Id?: string }) as its argument.
  // The command should:
  //   1. Extract the container ID (container?.id ?? container?.Id)
  //   2. Call panel.reveal() to show the webview
  //   3. Post a message to the webview: { type: 'navigate', url: `/chaos/container/${containerId}` }
  // Push the returned disposable to extensionContext.subscriptions.
  // Hint: panel.webview.postMessage(message)
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // #7: Register a tray menu
  // Register a submenu in the system tray with:
  //   - id: 'chaos-lab.tray'
  //   - label: 'Chaos Lab'
  //   - Two items: 'Open Dashboard' (id: 'chaos-lab.openChaos')
  //               and 'Stop All Chaos' (id: 'chaos-lab.stopAll')
  // Push the returned disposable to extensionContext.subscriptions.
  // Hint: extensionApi.tray.registerMenuItem({ id, type: 'submenu', label, submenu: [...] })
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // #8: Register the Chaos provider (connection creation)
  // Call registerChaosProvider(extensionContext) to register a container provider
  // that allows users to create, start, stop, and edit "Chaos machines"
  // from the Podman Desktop Resources page.
  // (The implementation lives in ./chaos-provider.ts — see TODOs #11–#13 there)
  // ---------------------------------------------------------------------------

  console.log('Chaos Lab extension activated');
}

export async function deactivate(): Promise<void> {
  console.log('Stopping Chaos Lab extension');
  if (statusBarUpdateInterval) {
    clearInterval(statusBarUpdateInterval);
    statusBarUpdateInterval = undefined;
  }
  await chaosEngine?.stopAll();
  disposeChaosProvider();
}
