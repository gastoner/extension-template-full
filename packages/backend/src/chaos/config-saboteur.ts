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
import type { ConfigSabotage, SabotageType } from '/@shared/src/ChaosApi';
import type { ContainerService } from '../container-service';

interface SabotageEntry {
  sabotage: ConfigSabotage;
  originalContent: string;
  targetFile: string;
}

export class ConfigSaboteur {
  private activeSabotages: Map<string, SabotageEntry> = new Map();
  private safePatterns: RegExp[] = [];

  constructor(private readonly containerService: ContainerService) {}

  setSafePatterns(patterns: string[]): void {
    this.safePatterns = patterns
      .filter(Boolean)
      .map(p => new RegExp('^' + p.replace(/\*/g, '.*') + '$', 'i'));
  }

  private isSafe(name: string): boolean {
    return this.safePatterns.some(r => r.test(name));
  }

  getActiveSabotages(): Record<string, ConfigSabotage> {
    const result: Record<string, ConfigSabotage> = {};
    for (const [id, entry] of this.activeSabotages) {
      result[id] = entry.sabotage;
    }
    return result;
  }

  listSabotages(): ConfigSabotage[] {
    return Array.from(this.activeSabotages.values()).map(e => e.sabotage);
  }

  async corrupt(containerId: string, type: SabotageType, targetFile?: string): Promise<void> {
    const containers = await this.containerService.listContainers();
    const target = containers.find(c => c.id === containerId);
    if (target && this.isSafe(target.name)) {
      throw new Error(`Container '${target.name}' is in the safe list and cannot be targeted.`);
    }

    if (this.activeSabotages.has(containerId)) {
      await this.restore(containerId);
    }

    const containerName = target?.name ?? containerId.substring(0, 12);
    let filePath: string;
    let corruptCmd: string;

    switch (type) {
      case 'dns-blackhole': {
        filePath = '/etc/resolv.conf';
        corruptCmd = 'echo "nameserver 127.0.0.1" > /etc/resolv.conf';
        break;
      }
      case 'file-corrupt': {
        filePath = targetFile ?? '/etc/hostname';
        corruptCmd = `head -c 256 /dev/urandom | base64 > ${filePath}`;
        break;
      }
    }

    let originalContent = '';
    try {
      const result = await extensionApi.process.exec('podman', [
        'exec', containerId, 'cat', filePath,
      ]);
      originalContent = result.stdout;
    } catch {
      // file may not exist
    }

    await extensionApi.process.exec('podman', [
      'exec', containerId, 'sh', '-c', corruptCmd,
    ]);

    this.activeSabotages.set(containerId, {
      sabotage: { containerId, containerName, type, targetFile: filePath, startedAt: Date.now() },
      originalContent,
      targetFile: filePath,
    });

    console.log(`Config sabotage (${type}) applied to ${containerName}: ${filePath}`);
  }

  async restore(containerId: string): Promise<void> {
    const entry = this.activeSabotages.get(containerId);
    if (!entry) return;

    try {
      const escaped = entry.originalContent.replace(/'/g, "'\\''");
      await extensionApi.process.exec('podman', [
        'exec', containerId, 'sh', '-c', `printf '%s' '${escaped}' > ${entry.targetFile}`,
      ]);
    } catch (err) {
      console.warn(`Failed to restore ${entry.targetFile} in ${containerId}:`, err);
    }

    this.activeSabotages.delete(containerId);
    console.log(`Config restored for ${containerId}`);
  }

  async rollbackAll(): Promise<void> {
    const containerIds = Array.from(this.activeSabotages.keys());
    for (const id of containerIds) {
      await this.restore(id);
    }
  }

  dispose(): void {
    this.activeSabotages.clear();
  }
}
