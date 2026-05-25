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

import type { AttackType, Scenario, ScenarioStep } from '/@shared/src/ChaosApi';
import type { ContainerService } from '../container-service';
import type { NetworkShaper } from './network-shaper';
import type { ResourceLimiter } from './resource-limiter';

interface AffectedContainer {
  attackType: AttackType;
  engineId: string;
}

interface ScheduledScenario {
  scenario: Scenario;
  intervalHandle?: ReturnType<typeof setInterval>;
  affectedContainers: Map<string, AffectedContainer>;
}

export class ScenarioScheduler {
  private scheduled: Map<string, ScheduledScenario> = new Map();
  private safePatterns: RegExp[] = [];

  constructor(
    private readonly containerService: ContainerService,
    private readonly networkShaper: NetworkShaper,
    private readonly resourceLimiter: ResourceLimiter,
  ) {}

  setSafePatterns(patterns: string[]): void {
    this.safePatterns = patterns
      .filter(Boolean)
      .map(p => new RegExp('^' + p.replace(/\*/g, '.*') + '$', 'i'));
  }

  private isSafe(name: string): boolean {
    return this.safePatterns.some(r => r.test(name));
  }

  addScenario(scenario: Scenario): void {
    if (this.scheduled.has(scenario.id)) {
      this.removeScenario(scenario.id);
    }

    const entry: ScheduledScenario = {
      scenario,
      affectedContainers: new Map(),
    };

    if (scenario.enabled) {
      entry.intervalHandle = setInterval(() => {
        this.executeAttack(entry).catch(err =>
          console.error(`Scenario ${scenario.name} attack failed:`, err),
        );
      }, scenario.intervalSec * 1000);
    }

    this.scheduled.set(scenario.id, entry);
  }

  removeScenario(id: string): void {
    const entry = this.scheduled.get(id);
    if (entry?.intervalHandle) {
      clearInterval(entry.intervalHandle);
    }
    this.scheduled.delete(id);
  }

  toggleScenario(id: string, enabled: boolean): void {
    const entry = this.scheduled.get(id);
    if (!entry) return;

    entry.scenario.enabled = enabled;

    if (entry.intervalHandle) {
      clearInterval(entry.intervalHandle);
      entry.intervalHandle = undefined;
    }

    if (enabled) {
      entry.intervalHandle = setInterval(() => {
        this.executeAttack(entry).catch(err =>
          console.error(`Scenario ${entry.scenario.name} attack failed:`, err),
        );
      }, entry.scenario.intervalSec * 1000);
    }
  }

  listScenarios(): Scenario[] {
    return Array.from(this.scheduled.values()).map(e => e.scenario);
  }

  async rollbackAll(): Promise<void> {
    for (const entry of this.scheduled.values()) {
      if (entry.intervalHandle) {
        clearInterval(entry.intervalHandle);
        entry.intervalHandle = undefined;
      }
      entry.scenario.enabled = false;

      for (const [key, info] of entry.affectedContainers) {
        const containerId = key.replace(/-(network|resources|disconnect)$/, '');
        try {
          switch (info.attackType) {
            case 'pause':
              await this.containerService.unpauseContainer(containerId);
              break;
            case 'stop':
            case 'kill':
            case 'restart':
              await this.containerService.startContainer(info.engineId, containerId);
              break;
            case 'network-shape':
              await this.networkShaper.removeRule(containerId);
              break;
            case 'resource-limit':
              await this.resourceLimiter.removeLimit(containerId);
              break;
            case 'network-disconnect':
              break;
          }
        } catch (err: unknown) {
          console.warn(`Failed to rollback container ${containerId} (${info.attackType}):`, err);
        }
      }
      entry.affectedContainers.clear();
    }
  }

  dispose(): void {
    for (const entry of this.scheduled.values()) {
      if (entry.intervalHandle) {
        clearInterval(entry.intervalHandle);
      }
    }
    this.scheduled.clear();
  }

  private async executeAttack(entry: ScheduledScenario): Promise<void> {
    const { scenario } = entry;
    const containers = await this.containerService.listContainers();
    const running = containers.filter(c => c.state === 'running' && !this.isSafe(c.name));

    if (running.length === 0) return;

    for (const step of scenario.steps) {
      if (step.delaySec && step.delaySec > 0) {
        await this.delay(step.delaySec * 1000);
      }

      const targets = this.resolveStepTargets(step, scenario, running);

      for (const target of targets) {
        try {
          await this.executeStep(step, target, entry);
          console.log(`Chaos: ${step.attackType} on ${target.name}`);
        } catch (err: unknown) {
          console.warn(`Chaos attack ${step.attackType} failed on ${target.name}:`, err);
        }
      }
    }
  }

  private resolveStepTargets(
    step: ScenarioStep,
    scenario: Scenario,
    running: { id: string; engineId: string; name: string; state: string }[],
  ): { id: string; engineId: string; name: string }[] {
    if (step.targetContainerIds?.length) {
      return running.filter(c => step.targetContainerIds!.includes(c.id));
    }

    if (scenario.targetStrategy === 'specific' && scenario.targetIds) {
      return running.filter(c => scenario.targetIds!.includes(c.id));
    }

    if (scenario.targetStrategy === 'random') {
      const idx = Math.floor(Math.random() * running.length);
      return [running[idx]];
    }

    return running;
  }

  private async executeStep(
    step: ScenarioStep,
    target: { id: string; engineId: string; name: string },
    entry: ScheduledScenario,
  ): Promise<void> {
    switch (step.attackType) {
      case 'stop':
        await this.containerService.stopContainer(target.engineId, target.id);
        entry.affectedContainers.set(target.id, { attackType: 'stop', engineId: target.engineId });
        break;
      case 'kill':
        await this.containerService.killContainer(target.id);
        entry.affectedContainers.set(target.id, { attackType: 'kill', engineId: target.engineId });
        break;
      case 'pause':
        await this.containerService.pauseContainer(target.id);
        entry.affectedContainers.set(target.id, { attackType: 'pause', engineId: target.engineId });
        break;
      case 'restart':
        await this.containerService.restartContainer(target.engineId, target.id);
        entry.affectedContainers.set(target.id, { attackType: 'restart', engineId: target.engineId });
        break;
      case 'network-shape':
        await this.networkShaper.applyRule({
          containerId: target.id,
          latencyMs: step.latencyMs,
          packetLossPercent: step.packetLossPercent,
          bandwidthKbps: step.bandwidthKbps,
        });
        entry.affectedContainers.set(`${target.id}-network`, { attackType: 'network-shape', engineId: target.engineId });
        break;
      case 'resource-limit':
        await this.resourceLimiter.applyLimit({
          containerId: target.id,
          cpuPercent: step.cpuPercent ?? 50,
          memoryMb: step.memoryMb ?? 64,
        });
        entry.affectedContainers.set(`${target.id}-resources`, { attackType: 'resource-limit', engineId: target.engineId });
        break;
      case 'network-disconnect':
        if (step.disconnectNetworks) {
          for (const network of step.disconnectNetworks) {
            await this.containerService.disconnectFromNetwork(target.id, network);
          }
        }
        entry.affectedContainers.set(`${target.id}-disconnect`, { attackType: 'network-disconnect', engineId: target.engineId });
        break;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
