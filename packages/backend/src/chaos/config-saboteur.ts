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

import fs from 'node:fs';
import path from 'node:path';
import * as extensionApi from '@podman-desktop/api';
import type { ConfigSabotage, SabotageType } from '/@shared/src/ChaosApi';
import type { ContainerService } from '../container-service';
import type { AffectedRegistry } from './affected-registry';
import { PersistedSabotageSchema, parsePersistedArray } from './persistence-schemas';

interface SabotageEntry {
  sabotage: ConfigSabotage;
  originalContent: string;
}

interface PersistedSabotage {
  sabotage: ConfigSabotage;
}

export class ConfigSaboteur {
  private activeSabotages: Map<string, SabotageEntry> = new Map();
  private safePatterns: RegExp[] = [];
  private registry: AffectedRegistry | undefined;
  private secretStorage: extensionApi.SecretStorage | undefined;
  private storagePath: string | undefined;
  private readonly fileName = 'config-sabotages.json';

  constructor(private readonly containerService: ContainerService) {}

  setRegistry(registry: AffectedRegistry): void {
    this.registry = registry;
  }

  setSecretStorage(secretStorage: extensionApi.SecretStorage): void {
    this.secretStorage = secretStorage;
  }

  setStoragePath(storagePath: string): void {
    this.storagePath = storagePath;
  }

  private secretKey(containerId: string): string {
    return `config-sabotage.${containerId}`;
  }

  async save(): Promise<void> {
    if (!this.storagePath) return;
    try {
      await fs.promises.mkdir(this.storagePath, { recursive: true });
      const filePath = path.join(this.storagePath, this.fileName);
      const entries: PersistedSabotage[] = Array.from(this.activeSabotages.values()).map(({ sabotage }) => ({
        sabotage,
      }));
      await fs.promises.writeFile(filePath, JSON.stringify(entries, undefined, 2), 'utf8');
    } catch (err) {
      console.warn('Failed to save config sabotages:', err);
    }
  }

  async load(): Promise<void> {
    if (!this.storagePath) return;
    const filePath = path.join(this.storagePath, this.fileName);
    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');
      const entries = parsePersistedArray(JSON.parse(raw), PersistedSabotageSchema, this.fileName);
      this.activeSabotages.clear();
      for (const { sabotage } of entries) {
        const originalContent = await this.secretStorage?.get(this.secretKey(sabotage.containerId));
        if (originalContent === undefined) {
          console.warn(
            `Skipping stale config sabotage for ${sabotage.containerId}: original content not found in secret storage`,
          );
          continue;
        }
        this.activeSabotages.set(sabotage.containerId, { sabotage, originalContent });
      }
    } catch {
      // file doesn't exist or is malformed — start fresh
    }
  }

  setSafePatterns(patterns: string[]): void {
    this.safePatterns = patterns.filter(Boolean).map(p => new RegExp('^' + p.replace(/\*/g, '.*') + '$', 'i'));
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
      const result = await extensionApi.process.exec('podman', ['exec', containerId, 'cat', filePath]);
      originalContent = result.stdout;
    } catch {
      // file may not exist
    }

    await extensionApi.process.exec('podman', ['exec', containerId, 'sh', '-c', corruptCmd]);

    this.activeSabotages.set(containerId, {
      sabotage: { containerId, containerName, type, targetFile: filePath, startedAt: Date.now() },
      originalContent,
    });
    await this.secretStorage?.store(this.secretKey(containerId), originalContent);
    await this.save();
    // Marked as affected only now that the sabotage actually succeeded and is tracked
    // in-memory — otherwise a failure above (e.g. exec failing) would leave a phantom entry
    // in the registry that the dashboard shows but no subsystem can revert.
    await this.registry?.markAffected(containerId, `config-${type}`);

    console.log(`Config sabotage (${type}) applied to ${containerName}: ${filePath}`);
  }

  async restore(containerId: string): Promise<void> {
    const entry = this.activeSabotages.get(containerId);
    if (!entry) return;

    try {
      const escaped = entry.originalContent.replace(/'/g, `'\\''`);
      await extensionApi.process.exec('podman', [
        'exec',
        containerId,
        'sh',
        '-c',
        `printf '%s' '${escaped}' > ${entry.sabotage.targetFile}`,
      ]);
    } catch (err) {
      console.warn(`Failed to restore ${entry.sabotage.targetFile} in ${containerId}:`, err);
    }

    const sabotageType = entry.sabotage.type;
    this.activeSabotages.delete(containerId);
    await this.secretStorage?.delete(this.secretKey(containerId));
    await this.save();
    await this.registry?.removeAttack(containerId, `config-${sabotageType}`);
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
