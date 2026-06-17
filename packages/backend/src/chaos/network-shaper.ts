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
import type { NetworkRule } from '/@shared/src/ChaosApi';
import type { ContainerService } from '../container-service';

export class NetworkShaper {
  private activeRules: Map<string, NetworkRule> = new Map();
  private safePatterns: RegExp[] = [];

  constructor(private readonly containerService: ContainerService) {}

  setSafePatterns(patterns: string[]): void {
    this.safePatterns = patterns.filter(Boolean).map(p => new RegExp('^' + p.replace(/\*/g, '.*') + '$', 'i'));
  }

  private isSafe(name: string): boolean {
    return this.safePatterns.some(r => r.test(name));
  }

  private async execTc(containerId: string, tcArgs: string[]): Promise<void> {
    await extensionApi.process.exec('podman', [
      'exec',
      '--privileged',
      containerId,
      'sh',
      '-c',
      `PATH="$PATH:/sbin:/usr/sbin:/usr/local/sbin" tc ${tcArgs.join(' ')}`,
    ]);
  }

  getActiveRules(): Record<string, NetworkRule> {
    return Object.fromEntries(this.activeRules);
  }

  async applyRule(rule: NetworkRule): Promise<void> {
    const containers = await this.containerService.listContainers();
    const target = containers.find(c => c.id === rule.containerId);
    if (target && this.isSafe(target.name)) {
      throw new Error(`Container '${target.name}' is in the safe list and cannot be targeted.`);
    }

    const hasTc = await this.containerService.checkToolAvailability(rule.containerId, 'tc');
    if (!hasTc) {
      throw new Error(
        `Container ${rule.containerId} does not have 'tc' (iproute2) installed. ` +
          'Network shaping requires iproute2 inside the target container.',
      );
    }

    try {
      await this.execTc(rule.containerId, ['qdisc', 'del', 'dev', 'eth0', 'root']);
    } catch {
      // No existing qdisc — that's fine
    }

    const tcArgs = ['qdisc', 'add', 'dev', 'eth0', 'root', 'netem'];

    if (rule.latencyMs !== undefined && rule.latencyMs > 0) {
      tcArgs.push('delay', `${rule.latencyMs}ms`);
    }
    if (rule.packetLossPercent !== undefined && rule.packetLossPercent > 0) {
      tcArgs.push('loss', `${rule.packetLossPercent}%`);
    }
    if (rule.bandwidthKbps !== undefined && rule.bandwidthKbps > 0) {
      tcArgs.push('rate', `${rule.bandwidthKbps}kbit`);
    }

    await this.execTc(rule.containerId, tcArgs);

    if (rule.dnsBlock && rule.dnsBlock.length > 0) {
      for (const host of rule.dnsBlock) {
        await extensionApi.process.exec('podman', [
          'exec',
          rule.containerId,
          'sh',
          '-c',
          `echo "127.0.0.1 ${host}" >> /etc/hosts`,
        ]);
      }
    }

    this.activeRules.set(rule.containerId, rule);
    console.log(`Network shaping applied to ${rule.containerId}`);
  }

  async removeRule(containerId: string): Promise<void> {
    const rule = this.activeRules.get(containerId);
    if (!rule) return;

    try {
      await this.execTc(containerId, ['qdisc', 'del', 'dev', 'eth0', 'root']);
    } catch (err: unknown) {
      console.warn(`Failed to remove tc qdisc from ${containerId}:`, err);
    }

    if (rule.dnsBlock && rule.dnsBlock.length > 0) {
      for (const host of rule.dnsBlock) {
        try {
          await extensionApi.process.exec('podman', [
            'exec',
            containerId,
            'sh',
            '-c',
            `sed -i '/127.0.0.1 ${host}/d' /etc/hosts`,
          ]);
        } catch (err: unknown) {
          console.warn(`Failed to remove DNS block for ${host} from ${containerId}:`, err);
        }
      }
    }

    this.activeRules.delete(containerId);
    console.log(`Network shaping removed from ${containerId}`);
  }

  async rollbackAll(): Promise<void> {
    const containerIds = Array.from(this.activeRules.keys());
    for (const id of containerIds) {
      await this.removeRule(id);
    }
  }

  dispose(): void {
    this.activeRules.clear();
  }
}
