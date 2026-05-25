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
import type { ResourceLimit } from '/@shared/src/ChaosApi';
import type { ContainerService } from '../container-service';

interface OriginalLimits {
  cpus: string;
  memory: string;
}

export class ResourceLimiter {
  private activeLimits: Map<string, ResourceLimit> = new Map();
  private originalLimits: Map<string, OriginalLimits> = new Map();
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

  getActiveLimits(): Record<string, ResourceLimit> {
    return Object.fromEntries(this.activeLimits);
  }

  async applyLimit(limit: ResourceLimit): Promise<void> {
    const containers = await this.containerService.listContainers();
    const target = containers.find(c => c.id === limit.containerId);
    if (target && this.isSafe(target.name)) {
      throw new Error(`Container '${target.name}' is in the safe list and cannot be targeted.`);
    }

    if (!this.originalLimits.has(limit.containerId)) {
      try {
        const inspect = await this.containerService.inspectContainer(limit.containerId);
        const hostConfig = (inspect as Record<string, unknown>).HostConfig as Record<string, unknown> | undefined;
        this.originalLimits.set(limit.containerId, {
          cpus: String(hostConfig?.NanoCpus ?? 0),
          memory: String(hostConfig?.Memory ?? 0),
        });
      } catch {
        this.originalLimits.set(limit.containerId, { cpus: '0', memory: '0' });
      }
    }

    const cpuValue = (limit.cpuPercent / 100).toFixed(2);
    const memValue = `${limit.memoryMb}m`;

    await extensionApi.process.exec('podman', [
      'update',
      '--cpus', cpuValue,
      '--memory', memValue,
      limit.containerId,
    ]);

    this.activeLimits.set(limit.containerId, limit);
    console.log(`Resource limits applied to ${limit.containerId}: CPU ${cpuValue}, MEM ${memValue}`);
  }

  async removeLimit(containerId: string): Promise<void> {
    const original = this.originalLimits.get(containerId);
    if (!original) {
      this.activeLimits.delete(containerId);
      return;
    }

    try {
      const args = ['update', containerId];
      if (original.cpus !== '0') {
        const cpuFloat = parseInt(original.cpus, 10) / 1e9;
        args.push('--cpus', cpuFloat.toFixed(2));
      } else {
        args.push('--cpus', '0');
      }
      if (original.memory !== '0') {
        const memBytes = parseInt(original.memory, 10);
        const memMb = Math.ceil(memBytes / (1024 * 1024));
        args.push('--memory', `${memMb}m`);
      } else {
        args.push('--memory', '0');
      }

      await extensionApi.process.exec('podman', args);
    } catch (err: unknown) {
      console.warn(`Failed to restore original limits for ${containerId}:`, err);
    }

    this.activeLimits.delete(containerId);
    this.originalLimits.delete(containerId);
    console.log(`Resource limits restored for ${containerId}`);
  }

  async rollbackAll(): Promise<void> {
    const containerIds = Array.from(this.activeLimits.keys());
    for (const id of containerIds) {
      await this.removeLimit(id);
    }
  }

  dispose(): void {
    this.activeLimits.clear();
    this.originalLimits.clear();
  }
}
