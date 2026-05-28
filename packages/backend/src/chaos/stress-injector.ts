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
import type { StressInjection, StressType } from '/@shared/src/ChaosApi';
import type { ContainerService } from '../container-service';

const STRESS_MARKER = 'CHAOS_LAB_STRESS';

export class StressInjector {
  private activeStress: Map<string, StressInjection> = new Map();
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

  getActiveInjections(): Record<string, StressInjection> {
    const result: Record<string, StressInjection> = {};
    for (const [id, injection] of this.activeStress) {
      result[id] = injection;
    }
    return result;
  }

  listInjections(): StressInjection[] {
    return Array.from(this.activeStress.values());
  }

  async inject(containerId: string, type: StressType, workers = 1, targetMb = 64): Promise<void> {
    const containers = await this.containerService.listContainers();
    const target = containers.find(c => c.id === containerId);
    if (target && this.isSafe(target.name)) {
      throw new Error(`Container '${target.name}' is in the safe list and cannot be targeted.`);
    }

    if (this.activeStress.has(containerId)) {
      await this.stop(containerId);
    }

    const containerName = target?.name ?? containerId.substring(0, 12);

    switch (type) {
      case 'cpu': {
        for (let i = 0; i < workers; i++) {
          await this.execDetached(containerId, `${STRESS_MARKER}=1 sh -c 'while true; do :; done'`);
        }
        break;
      }
      case 'memory': {
        const cmd = `${STRESS_MARKER}=1 sh -c 'head -c ${targetMb}M /dev/urandom | tail -c ${targetMb}M | cat > /dev/null & sleep infinity'`;
        await this.execDetached(containerId, cmd);
        break;
      }
      case 'log-flood': {
        const cmd = `${STRESS_MARKER}=1 sh -c 'while true; do echo "ERROR: chaos-lab stress $(date +%s)"; done'`;
        await this.execDetached(containerId, cmd);
        break;
      }
    }

    this.activeStress.set(containerId, {
      containerId, containerName, type, workers, targetMb, startedAt: Date.now(),
    });

    console.log(`Stress injection (${type}) started on ${containerName}`);
  }

  async stop(containerId: string): Promise<void> {
    const entry = this.activeStress.get(containerId);
    if (!entry) return;

    try {
      await extensionApi.process.exec('podman', [
        'exec', containerId, 'sh', '-c',
        `ps aux 2>/dev/null | grep '${STRESS_MARKER}' | grep -v grep | awk '{print $2}' | xargs -r kill -9 2>/dev/null; ` +
        `pgrep -f '${STRESS_MARKER}' 2>/dev/null | xargs -r kill -9 2>/dev/null; true`,
      ]);
    } catch {
      // container may have stopped
    }

    this.activeStress.delete(containerId);
    console.log(`Stress injection stopped on ${containerId}`);
  }

  async rollbackAll(): Promise<void> {
    const containerIds = Array.from(this.activeStress.keys());
    for (const id of containerIds) {
      await this.stop(id);
    }
  }

  dispose(): void {
    this.activeStress.clear();
  }

  private async execDetached(containerId: string, cmd: string): Promise<void> {
    try {
      await extensionApi.process.exec('podman', [
        'exec', '-d', containerId, 'sh', '-c', cmd,
      ]);
    } catch (err) {
      console.warn(`Failed to exec detached in ${containerId}:`, err);
    }
  }
}
