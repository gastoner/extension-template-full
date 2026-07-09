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

let chaosEngine: ChaosEngine | undefined;

export async function activate(extensionContext: ExtensionContext): Promise<void> {
  console.log('Starting Chaos Lab extension');

  const settingsManager = new SettingsManager();
  settingsManager.load();
  extensionContext.subscriptions.push({ dispose: () => settingsManager.dispose() });

  const settings = settingsManager.getSettings();

  const containerService = new ContainerService();

  chaosEngine = new ChaosEngine(containerService);
  chaosEngine.setSafePatterns(settings.chaosSafeContainers);

  const storagePath = extensionContext.storagePath;
  chaosEngine.setStoragePath(storagePath);
  chaosEngine.setSecretStorage(extensionContext.secrets);
  await chaosEngine.loadPersistedState();

  extensionContext.subscriptions.push({ dispose: () => chaosEngine?.dispose() });

  const chaosApiImpl = new ChaosApiImpl(chaosEngine, containerService);
  await chaosApiImpl.setNotificationsEnabled(settings.showNotifications);

  const panel = extensionApi.window.createWebviewPanel('chaos-lab', 'Chaos Lab', {
    localResourceRoots: [extensionApi.Uri.joinPath(extensionContext.extensionUri, 'media')],
  });
  extensionContext.subscriptions.push(panel);

  const indexHtmlUri = extensionApi.Uri.joinPath(extensionContext.extensionUri, 'media', 'index.html');
  const indexHtmlPath = indexHtmlUri.fsPath;
  let indexHtml = await fs.promises.readFile(indexHtmlPath, 'utf8');

  const scriptLinks = indexHtml.match(/<script.*?src="(.*?)".*?>/g);
  if (scriptLinks) {
    scriptLinks.forEach(link => {
      const src = link.match(/src="(.*?)"/);
      if (src) {
        const webviewUri = panel.webview.asWebviewUri(
          extensionApi.Uri.joinPath(extensionContext.extensionUri, 'media', src[1]),
        );
        indexHtml = indexHtml.replace(src[1], webviewUri.toString());
      }
    });
  }

  const cssLinks = indexHtml.match(/<link.*?href="(.*?)".*?>/g);
  if (cssLinks) {
    cssLinks.forEach(link => {
      const href = link.match(/href="(.*?)"/);
      if (href) {
        const webviewUri = panel.webview.asWebviewUri(
          extensionApi.Uri.joinPath(extensionContext.extensionUri, 'media', href[1]),
        );
        indexHtml = indexHtml.replace(href[1], webviewUri.toString());
      }
    });
  }

  const fontUrls = indexHtml.match(/url\(([^)]+\.(?:woff2?|ttf))\)/g);
  if (fontUrls) {
    const seen = new Set<string>();
    fontUrls.forEach(match => {
      const urlPath = match.match(/url\(([^)]+)\)/);
      if (urlPath && !seen.has(urlPath[1])) {
        seen.add(urlPath[1]);
        let fontPath = urlPath[1];
        if (fontPath.startsWith('./')) {
          fontPath = `_app/immutable/assets/${fontPath.slice(2)}`;
        } else if (fontPath.startsWith('/')) {
          fontPath = fontPath.slice(1);
        }
        const webviewUri = panel.webview.asWebviewUri(
          extensionApi.Uri.joinPath(extensionContext.extensionUri, 'media', fontPath),
        );
        indexHtml = indexHtml.replaceAll(urlPath[1], webviewUri.toString());
      }
    });
  }

  panel.webview.html = indexHtml;

  const rpcExtension = new RpcExtension(panel.webview);
  rpcExtension.registerInstance<ChaosApiImpl>(ChaosApiImpl, chaosApiImpl);

  settingsManager.onSettingsChanged(newSettings => {
    chaosEngine?.setSafePatterns(newSettings.chaosSafeContainers);
    void chaosApiImpl.setNotificationsEnabled(newSettings.showNotifications);

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

  const updateStatusBar = (): void => {
    const state = chaosEngine?.getState();
    if (!state) {
      chaosStatusBar.text = 'Chaos Lab';
      return;
    }

    const parts: string[] = [];
    if (state.runningAttacks > 0) parts.push(`${state.runningAttacks} active`);
    if (state.killCount > 0) parts.push(`${state.killCount} killed`);

    chaosStatusBar.text = parts.length > 0 ? `Chaos Lab (${parts.join(' | ')})` : 'Chaos Lab';
  };

  // Reflects the persisted state loaded above, then stays in sync via the chaos
  // engine's change event instead of polling on a timer.
  updateStatusBar();
  chaosEngine.onStateChanged(updateStatusBar);

  const stopAllCommand = extensionApi.commands.registerCommand('chaos-lab.stopAll', async () => {
    // revertAllContainers() already notifies the user (via ChaosApiImpl.notify) once done.
    await chaosApiImpl.revertAllContainers();
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

  const freezeCommand = extensionApi.commands.registerCommand(
    'chaos-lab.freezeContainer',
    async (container: { id?: string; Id?: string }) => {
      const containerId = container?.id ?? container?.Id;
      if (!containerId) return;
      const containers = await containerService.listContainers();
      const target = containers.find(c => c.id === containerId);
      const name = target?.name ?? containerId.substring(0, 12);
      await chaosApiImpl.isolateContainer({
        containerId,
        containerName: name,
        mode: 'pause',
        startedAt: Date.now(),
      });
    },
  );
  extensionContext.subscriptions.push(freezeCommand);

  const disconnectCommand = extensionApi.commands.registerCommand(
    'chaos-lab.disconnectContainer',
    async (container: { id?: string; Id?: string }) => {
      const containerId = container?.id ?? container?.Id;
      if (!containerId) return;
      const networks = await containerService.getContainerNetworks(containerId);
      const containers = await containerService.listContainers();
      const target = containers.find(c => c.id === containerId);
      const name = target?.name ?? containerId.substring(0, 12);
      await chaosApiImpl.isolateContainer({
        containerId,
        containerName: name,
        mode: 'network-disconnect',
        disconnectedNetworks: networks,
        startedAt: Date.now(),
      });
    },
  );
  extensionContext.subscriptions.push(disconnectCommand);

  const killCommand = extensionApi.commands.registerCommand(
    'chaos-lab.killContainer',
    async (container: { id?: string; Id?: string }) => {
      const containerId = container?.id ?? container?.Id;
      if (!containerId) return;
      await containerService.killContainer(containerId);
      chaosEngine?.incrementKillCount();
      const containers = await containerService.listContainers();
      const name = containers.find(c => c.id === containerId)?.name ?? containerId.substring(0, 12);
      void extensionApi.window.showWarningMessage(`Container ${name} killed`);
    },
  );
  extensionContext.subscriptions.push(killCommand);

  const stressCommand = extensionApi.commands.registerCommand(
    'chaos-lab.stressContainer',
    async (container: { id?: string; Id?: string }) => {
      const containerId = container?.id ?? container?.Id;
      if (!containerId) return;
      await chaosApiImpl.injectStress(containerId, 'cpu', 1);
    },
  );
  extensionContext.subscriptions.push(stressCommand);

  const runScenarioCommand = extensionApi.commands.registerCommand(
    'chaos-lab.runScenario',
    async (args: { id?: string; name?: string }) => {
      const scenarios = chaosEngine!.scheduler.listScenarios();
      const target = args?.id
        ? scenarios.find(s => s.id === args.id)
        : args?.name
          ? scenarios.find(s => s.name === args.name)
          : undefined;
      if (!target) {
        void extensionApi.window.showWarningMessage('Scenario not found');
        return;
      }
      await chaosApiImpl.runScenarioOnce(target.id);
    },
  );
  extensionContext.subscriptions.push(runScenarioCommand);

  const revertAllCommand = extensionApi.commands.registerCommand('chaos-lab.revertAll', async () => {
    await chaosApiImpl.revertAllContainers();
  });
  extensionContext.subscriptions.push(revertAllCommand);

  const revertContainerCommand = extensionApi.commands.registerCommand(
    'chaos-lab.revertContainer',
    async (container: { id?: string; Id?: string }) => {
      const containerId = container?.id ?? container?.Id;
      if (!containerId) return;
      await chaosApiImpl.revertContainer(containerId);
    },
  );
  extensionContext.subscriptions.push(revertContainerCommand);

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

  console.log('Chaos Lab extension activated');
}

export async function deactivate(): Promise<void> {
  console.log('Stopping Chaos Lab extension');
  // Intentionally does not roll back active chaos effects: they are persisted to disk and
  // reloaded by loadPersistedState() on the next activation, so containers stay in whatever
  // state the user put them in. Use "Stop All Chaos" / per-attack "Restore" to revert explicitly.
}
