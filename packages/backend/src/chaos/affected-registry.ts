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
import type { AffectedContainerState } from '/@shared/src/ChaosApi';
import type { ContainerService } from '../container-service';
import { AffectedContainerStateSchema, parsePersistedArray } from './persistence-schemas';

export class AffectedRegistry {
  private affected: Map<string, AffectedContainerState> = new Map();
  private storagePath: string | undefined;
  private readonly fileName = 'affected-containers.json';
  private changeListeners: Array<() => void> = [];

  constructor(private readonly containerService: ContainerService) {}

  setStoragePath(storagePath: string): void {
    this.storagePath = storagePath;
  }

  /** Notified after every mutation (markAffected/removeAttack/clearContainer/clear) so callers can react without polling. */
  onChanged(listener: () => void): void {
    this.changeListeners.push(listener);
  }

  private notifyChanged(): void {
    for (const listener of this.changeListeners) {
      listener();
    }
  }

  async markAffected(containerId: string, attackType: string): Promise<void> {
    const existing = this.affected.get(containerId);
    if (existing) {
      if (!existing.activeAttacks.includes(attackType)) {
        existing.activeAttacks.push(attackType);
      }
      await this.save();
      this.notifyChanged();
      return;
    }

    const containers = await this.containerService.listContainers();
    const container = containers.find(c => c.id === containerId);

    let networks: string[] = [];
    let cpuNanos = 0;
    let memoryBytes = 0;

    try {
      networks = await this.containerService.getContainerNetworks(containerId);
    } catch {
      // container may not have network info available
    }

    try {
      const inspect = await this.containerService.inspectContainer(containerId);
      const hostConfig = (inspect as Record<string, unknown>).HostConfig as Record<string, unknown> | undefined;
      cpuNanos = Number(hostConfig?.NanoCpus ?? 0);
      memoryBytes = Number(hostConfig?.Memory ?? 0);
    } catch {
      // inspection may fail
    }

    const entry: AffectedContainerState = {
      containerId,
      containerName: container?.name ?? containerId.substring(0, 12),
      engineId: container?.engineId ?? '',
      firstAffectedAt: Date.now(),
      originalState: {
        wasRunning: container?.state === 'running',
        networks,
        cpuNanos,
        memoryBytes,
      },
      activeAttacks: [attackType],
    };

    this.affected.set(containerId, entry);
    await this.save();
    this.notifyChanged();
  }

  async removeAttack(containerId: string, attackType: string): Promise<void> {
    const entry = this.affected.get(containerId);
    if (!entry) return;
    entry.activeAttacks = entry.activeAttacks.filter(a => a !== attackType);
    await this.save();
    this.notifyChanged();
  }

  async clearContainer(containerId: string): Promise<void> {
    this.affected.delete(containerId);
    await this.save();
    this.notifyChanged();
  }

  getAffected(): AffectedContainerState[] {
    return Array.from(this.affected.values());
  }

  getEntry(containerId: string): AffectedContainerState | undefined {
    return this.affected.get(containerId);
  }

  has(containerId: string): boolean {
    return this.affected.has(containerId);
  }

  async save(): Promise<void> {
    if (!this.storagePath) return;

    try {
      await fs.promises.mkdir(this.storagePath, { recursive: true });
      const filePath = path.join(this.storagePath, this.fileName);
      const data = JSON.stringify(Array.from(this.affected.values()), undefined, 2);
      await fs.promises.writeFile(filePath, data, 'utf8');
    } catch (err) {
      console.warn('Failed to save affected containers:', err);
    }
  }

  async load(): Promise<void> {
    if (!this.storagePath) return;

    const filePath = path.join(this.storagePath, this.fileName);
    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');
      const entries = parsePersistedArray(JSON.parse(raw), AffectedContainerStateSchema, this.fileName);
      this.affected.clear();
      for (const entry of entries) {
        this.affected.set(entry.containerId, entry);
      }
    } catch {
      // file doesn't exist or is malformed — start fresh
    }
  }

  async clear(): Promise<void> {
    this.affected.clear();
    await this.save();
    this.notifyChanged();
  }
}
