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

  const chaosStatusBar = extensionApi.window.createStatusBarItem();
  chaosStatusBar.text = 'Chaos Lab';
  chaosStatusBar.command = 'chaos-lab.openChaos';
  if (settings.showStatusBarChaos) {
    chaosStatusBar.show();
  }
  extensionContext.subscriptions.push(chaosStatusBar);

  statusBarUpdateInterval = setInterval(() => {
    const state = chaosEngine?.getState();
    if (state && state.runningAttacks > 0) {
      chaosStatusBar.text = `Chaos Lab (${state.runningAttacks} active)`;
    } else {
      chaosStatusBar.text = 'Chaos Lab';
    }
  }, 3000);
  extensionContext.subscriptions.push({
    dispose: () => {
      if (statusBarUpdateInterval) {
        clearInterval(statusBarUpdateInterval);
        statusBarUpdateInterval = undefined;
      }
    },
  });

  const stopAllCommand = extensionApi.commands.registerCommand('chaos-lab.stopAll', async () => {
    await chaosApiImpl.stopAllChaos();
    await extensionApi.window.showInformationMessage('All chaos operations have been stopped and rolled back.');
  });
  extensionContext.subscriptions.push(stopAllCommand);

  const openChaosCommand = extensionApi.commands.registerCommand('chaos-lab.openChaos', () => {
    panel.reveal();
  });
  extensionContext.subscriptions.push(openChaosCommand);

  const viewContainerCommand = extensionApi.commands.registerCommand(
    'chaos-lab.viewContainerUsage',
    async (container: { id?: string; Id?: string }) => {
      const containerId = container?.id ?? container?.Id;
      panel.reveal();
      await new Promise(resolve => setTimeout(resolve, 200));
      await panel.webview.postMessage({
        type: 'navigate',
        url: `/chaos/container/${containerId}`,
      });
    },
  );
  extensionContext.subscriptions.push(viewContainerCommand);

  const trayItem = extensionApi.tray.registerMenuItem({
    id: 'chaos-lab.tray',
    type: 'submenu',
    label: 'Chaos Lab',
    submenu: [
      { id: 'chaos-lab.openChaos', label: 'Open Dashboard', type: 'normal' },
      { id: 'chaos-lab.stopAll', label: 'Stop All Chaos', type: 'normal' },
    ],
  });
  extensionContext.subscriptions.push(trayItem);

  // ---------------------------------------------------------------------------
  // #14: Register a CLI tool
  // Use extensionApi.cli.createCliTool() to register a CLI tool with:
  //   - name: 'chaos-cli'
  //   - displayName: 'Chaos CLI'
  //   - markdownDescription: 'CLI for managing chaos experiments from the terminal'
  //   - images: { icon: './icon.png' }
  //   - version: '0.1.0'
  //   - path: '/usr/local/bin/chaos-cli'
  // Push the returned disposable to extensionContext.subscriptions.
  // Hint: extensionApi.cli.createCliTool({ name, displayName, ... })
  // ---------------------------------------------------------------------------

  registerChaosProvider(extensionContext);

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
