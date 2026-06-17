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

import * as extensionApi from '@podman-desktop/api';
import type { IsolationRule } from '/@shared/src/ChaosApi';
import type { ContainerService } from '../container-service';

export class ContainerIsolator {
  private isolations: Map<string, IsolationRule> = new Map();
  private autoRestoreTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private safePatterns: RegExp[] = [];

  private async execIptables(containerId: string, args: string[]): Promise<void> {
    const joinedArgs = args.join(' ');
    try {
      await extensionApi.process.exec('podman', [
        'exec',
        '--privileged',
        containerId,
        'sh',
        '-c',
        `PATH="$PATH:/sbin:/usr/sbin:/usr/local/sbin" iptables ${joinedArgs}`,
      ]);
    } catch {
      await extensionApi.process.exec('podman', [
        'exec',
        '--privileged',
        containerId,
        'sh',
        '-c',
        `PATH="$PATH:/sbin:/usr/sbin:/usr/local/sbin" iptables-legacy ${joinedArgs}`,
      ]);
    }
  }

  constructor(private readonly containerService: ContainerService) {}

  setSafePatterns(patterns: string[]): void {
    this.safePatterns = patterns.filter(Boolean).map(p => new RegExp('^' + p.replace(/\*/g, '.*') + '$', 'i'));
  }

  private isSafe(name: string): boolean {
    return this.safePatterns.some(r => r.test(name));
  }

  getIsolations(): Record<string, IsolationRule> {
    return Object.fromEntries(this.isolations);
  }

  listIsolations(): IsolationRule[] {
    return Array.from(this.isolations.values());
  }

  async isolate(rule: IsolationRule): Promise<void> {
    if (this.isSafe(rule.containerName)) {
      throw new Error(`Container '${rule.containerName}' is in the safe list and cannot be isolated.`);
    }

    if (this.isolations.has(rule.containerId)) {
      await this.restore(rule.containerId);
    }

    rule.startedAt = Date.now();

    switch (rule.mode) {
      case 'pause':
        await this.containerService.pauseContainer(rule.containerId);
        break;

      case 'network-disconnect': {
        const networks = rule.disconnectedNetworks?.length
          ? rule.disconnectedNetworks
          : await this.containerService.getContainerNetworks(rule.containerId);
        rule.disconnectedNetworks = networks;
        for (const network of networks) {
          await this.containerService.disconnectFromNetwork(rule.containerId, network);
        }
        break;
      }

      case 'network-partition': {
        if (!rule.partitionPeers?.length) {
          throw new Error('Network partition requires at least one peer container ID.');
        }
        const hasIptables =
          (await this.containerService.checkToolAvailability(rule.containerId, 'iptables')) ||
          (await this.containerService.checkToolAvailability(rule.containerId, 'iptables-legacy'));
        if (!hasIptables) {
          throw new Error(
            `Container ${rule.containerName} does not have iptables. ` +
              'Network partition mode requires iptables inside the container.',
          );
        }
        for (const peerId of rule.partitionPeers) {
          const peerIp = await this.getContainerIp(peerId);
          if (peerIp) {
            await this.execIptables(rule.containerId, ['-A', 'OUTPUT', '-d', peerIp, '-j', 'DROP']);
            await this.execIptables(rule.containerId, ['-A', 'INPUT', '-s', peerIp, '-j', 'DROP']);
          }
        }
        break;
      }
    }

    this.isolations.set(rule.containerId, rule);

    if (rule.autoRestoreAfterSec && rule.autoRestoreAfterSec > 0) {
      const timer = setTimeout(() => {
        this.restore(rule.containerId).catch((err: unknown) =>
          console.warn(`Auto-restore failed for ${rule.containerName}:`, err),
        );
      }, rule.autoRestoreAfterSec * 1000);
      this.autoRestoreTimers.set(rule.containerId, timer);
    }

    console.log(`Isolated ${rule.containerName} (mode: ${rule.mode})`);
  }

  async restore(containerId: string): Promise<void> {
    const rule = this.isolations.get(containerId);
    if (!rule) return;

    const timer = this.autoRestoreTimers.get(containerId);
    if (timer) {
      clearTimeout(timer);
      this.autoRestoreTimers.delete(containerId);
    }

    switch (rule.mode) {
      case 'pause':
        try {
          await this.containerService.unpauseContainer(containerId);
        } catch (err: unknown) {
          console.warn(`Failed to unpause ${containerId}:`, err);
        }
        break;

      case 'network-disconnect':
        if (rule.disconnectedNetworks) {
          for (const network of rule.disconnectedNetworks) {
            try {
              await this.containerService.connectToNetwork(containerId, network);
            } catch (err: unknown) {
              console.warn(`Failed to reconnect ${containerId} to ${network}:`, err);
            }
          }
        }
        break;

      case 'network-partition':
        if (rule.partitionPeers) {
          for (const peerId of rule.partitionPeers) {
            const peerIp = await this.getContainerIp(peerId);
            if (peerIp) {
              try {
                await this.execIptables(containerId, ['-D', 'OUTPUT', '-d', peerIp, '-j', 'DROP']);
                await this.execIptables(containerId, ['-D', 'INPUT', '-s', peerIp, '-j', 'DROP']);
              } catch (err: unknown) {
                console.warn(`Failed to remove iptables rule for peer ${peerId}:`, err);
              }
            }
          }
        }
        break;
    }

    this.isolations.delete(containerId);
    console.log(`Restored ${rule.containerName} from isolation`);
  }

  async rollbackAll(): Promise<void> {
    const ids = Array.from(this.isolations.keys());
    for (const id of ids) {
      await this.restore(id);
    }
  }

  dispose(): void {
    for (const timer of this.autoRestoreTimers.values()) {
      clearTimeout(timer);
    }
    this.autoRestoreTimers.clear();
    this.isolations.clear();
  }

  private async getContainerIp(containerId: string): Promise<string | undefined> {
    try {
      const result = await extensionApi.process.exec('podman', [
        'inspect',
        containerId,
        '--format',
        '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
      ]);
      const ip = result.stdout.trim();
      return ip || undefined;
    } catch {
      return undefined;
    }
  }
}
