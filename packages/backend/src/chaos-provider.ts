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
 **********************************************************************/

import * as extensionApi from '@podman-desktop/api';

interface MachineConfig {
  cpus: number;
  memoryMb: number;
  diskGb: number;
}

interface MachineEntry {
  disposable: extensionApi.Disposable;
  status: extensionApi.ProviderConnectionStatus;
  config: MachineConfig;
}

let providerInstance: extensionApi.Provider | undefined;
const machines: Map<string, MachineEntry> = new Map();

const DEFAULT_CONFIG: MachineConfig = {
  cpus: 2,
  memoryMb: 2048,
  diskGb: 20,
};

export function registerChaosProvider(extensionContext: extensionApi.ExtensionContext): void {
  providerInstance = extensionApi.provider.createProvider({
    id: 'chaos',
    name: 'Chaos',
    status: 'unknown',
    version: '1.0.0',
    images: {
      icon: './icon.png',
      logo: { dark: './icon.png', light: './icon.png' },
    },
    emptyConnectionMarkdownDescription:
      'No Chaos machines running. Click **Create** to spin up a new Chaos machine.',
  });

  providerInstance.setContainerProviderConnectionFactory({
    creationDisplayName: 'Chaos Machine',
    creationButtonTitle: 'Create Chaos Machine',

    create: async (params, logger, token) => {
      const machineName = (params['chaos.factory.machine.name'] as string) || `chaos-${Date.now()}`;
      const cpus = Number(params['chaos.factory.machine.cpus']) || DEFAULT_CONFIG.cpus;
      const memoryBytes = Number(params['chaos.factory.machine.memory']) || DEFAULT_CONFIG.memoryMb * 1024 * 1024;
      const diskBytes = Number(params['chaos.factory.machine.diskSize']) || DEFAULT_CONFIG.diskGb * 1024 * 1024 * 1024;

      const memoryMb = Math.round(memoryBytes / (1024 * 1024));
      const diskGb = Math.round(diskBytes / (1024 * 1024 * 1024));
      const config: MachineConfig = { cpus, memoryMb, diskGb };

      logger?.log(`Creating Chaos machine '${machineName}' (${cpus} CPUs, ${memoryMb} MB RAM, ${diskGb} GB disk)...`);

      await extensionApi.window.withProgress(
        { location: extensionApi.ProgressLocation.TASK_WIDGET, title: `Creating Chaos Machine: ${machineName}` },
        async progress => {
          progress.report({ message: 'Allocating resources...' });
          await delay(1200);

          if (token?.isCancellationRequested) {
            logger?.log('Creation cancelled');
            return;
          }

          progress.report({ increment: 33, message: `Provisioning ${cpus} CPUs, ${memoryMb} MB RAM...` });
          await delay(1200);

          if (token?.isCancellationRequested) {
            logger?.log('Creation cancelled');
            return;
          }

          progress.report({ increment: 33, message: `Allocating ${diskGb} GB disk...` });
          await delay(1000);

          registerMachineConnection(machineName, config);
          providerInstance?.updateStatus('ready');

          progress.report({ increment: 34, message: `Machine '${machineName}' ready` });
          logger?.log(`Chaos machine '${machineName}' created and running`);
        },
      );
    },
  });

  extensionContext.subscriptions.push(providerInstance);
}

function registerMachineConnection(machineName: string, config: MachineConfig): void {
  const connectionDisposable = providerInstance!.registerContainerProviderConnection({
    name: machineName,
    type: 'podman',
    endpoint: { socketPath: `/tmp/chaos/${machineName}.sock` },
    status: () => machines.get(machineName)?.status ?? 'unknown',
    lifecycle: {
      start: async (_ctx, log) => {
        log?.log(`Starting machine '${machineName}'...`);
        const entry = machines.get(machineName);
        if (entry) entry.status = 'starting';
        await delay(1000);
        if (entry) entry.status = 'started';
        log?.log(`Machine '${machineName}' started (${entry?.config.cpus} CPUs, ${entry?.config.memoryMb} MB RAM)`);
      },

      stop: async (_ctx, log) => {
        log?.log(`Stopping machine '${machineName}'...`);
        const entry = machines.get(machineName);
        if (entry) entry.status = 'stopping';
        await delay(800);
        if (entry) entry.status = 'stopped';
        log?.log(`Machine '${machineName}' stopped`);
      },

      delete: async log => {
        log?.log(`Deleting machine '${machineName}'...`);
        machines.get(machineName)?.disposable.dispose();
        machines.delete(machineName);
        if (machines.size === 0) {
          providerInstance?.updateStatus('installed');
        }
        log?.log(`Machine '${machineName}' deleted`);
      },

      edit: async (_ctx, editParams, log) => {
        const entry = machines.get(machineName);
        if (!entry) {
          throw new Error(`Machine '${machineName}' not found`);
        }

        const newCpus = Number(editParams['chaos.machine.cpus']);
        const newMemoryBytes = Number(editParams['chaos.machine.memory']);
        const newDiskBytes = Number(editParams['chaos.machine.diskSize']);

        const newMemoryMb = newMemoryBytes ? Math.round(newMemoryBytes / (1024 * 1024)) : 0;
        const newDiskGb = newDiskBytes ? Math.round(newDiskBytes / (1024 * 1024 * 1024)) : 0;

        const changes: string[] = [];

        if (newCpus && newCpus !== entry.config.cpus) {
          changes.push(`CPUs: ${entry.config.cpus} → ${newCpus}`);
          entry.config.cpus = newCpus;
        }
        if (newMemoryMb && newMemoryMb !== entry.config.memoryMb) {
          changes.push(`Memory: ${entry.config.memoryMb} MB → ${newMemoryMb} MB`);
          entry.config.memoryMb = newMemoryMb;
        }
        if (newDiskGb && newDiskGb !== entry.config.diskGb) {
          changes.push(`Disk: ${entry.config.diskGb} GB → ${newDiskGb} GB`);
          entry.config.diskGb = newDiskGb;
        }

        if (changes.length === 0) {
          log?.log('No changes detected');
          return;
        }

        log?.log(`Updating machine '${machineName}': ${changes.join(', ')}`);

        await extensionApi.window.withProgress(
          { location: extensionApi.ProgressLocation.TASK_WIDGET, title: `Updating Chaos Machine: ${machineName}` },
          async progress => {
            progress.report({ message: 'Applying configuration changes...' });

            const wasRunning = entry.status === 'started';
            if (wasRunning) {
              progress.report({ message: 'Stopping machine for reconfiguration...' });
              entry.status = 'stopping';
              await delay(800);
              entry.status = 'stopped';
            }

            progress.report({ increment: 50, message: changes.join(', ') });
            await delay(1200);

            if (wasRunning) {
              progress.report({ message: 'Restarting machine...' });
              entry.status = 'starting';
              await delay(800);
              entry.status = 'started';
            }

            progress.report({ increment: 50, message: 'Configuration updated' });
            log?.log(`Machine '${machineName}' updated: ${entry.config.cpus} CPUs, ${entry.config.memoryMb} MB RAM, ${entry.config.diskGb} GB disk`);
          },
        );
      },
    },
  });

  machines.set(machineName, {
    disposable: connectionDisposable,
    status: 'started',
    config: { ...config },
  });
}

export function disposeChaosProvider(): void {
  for (const machine of machines.values()) {
    machine.disposable.dispose();
  }
  machines.clear();
  providerInstance?.dispose();
  providerInstance = undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
