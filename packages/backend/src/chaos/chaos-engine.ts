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

import type { ChaosState } from '/@shared/src/ChaosApi';
import type { ContainerService } from '../container-service';
import { ScenarioScheduler } from './scenario-scheduler';
import { NetworkShaper } from './network-shaper';
import { ResourceLimiter } from './resource-limiter';
import { ContainerIsolator } from './container-isolator';
import { StressInjector } from './stress-injector';
import { ConfigSaboteur } from './config-saboteur';

export class ChaosEngine {
  readonly scheduler: ScenarioScheduler;
  readonly networkShaper: NetworkShaper;
  readonly resourceLimiter: ResourceLimiter;
  readonly isolator: ContainerIsolator;
  readonly stressInjector: StressInjector;
  readonly configSaboteur: ConfigSaboteur;

  private _killCount = 0;
  private _chaosModeActive = false;
  private chaosModeInterval?: ReturnType<typeof setInterval>;
  private safePatterns: string[] = [];

  constructor(private readonly containerService: ContainerService) {
    this.networkShaper = new NetworkShaper(containerService);
    this.resourceLimiter = new ResourceLimiter(containerService);
    this.isolator = new ContainerIsolator(containerService);
    this.stressInjector = new StressInjector(containerService);
    this.configSaboteur = new ConfigSaboteur(containerService);
    this.scheduler = new ScenarioScheduler(containerService, this.networkShaper, this.resourceLimiter, this);
  }

  get killCount(): number {
    return this._killCount;
  }

  incrementKillCount(): void {
    this._killCount++;
  }

  get chaosModeActive(): boolean {
    return this._chaosModeActive;
  }

  setSafePatterns(patterns: string[]): void {
    this.safePatterns = patterns;
    this.scheduler.setSafePatterns(patterns);
    this.networkShaper.setSafePatterns(patterns);
    this.resourceLimiter.setSafePatterns(patterns);
    this.isolator.setSafePatterns(patterns);
    this.stressInjector.setSafePatterns(patterns);
    this.configSaboteur.setSafePatterns(patterns);
  }

  async enableChaosMode(intervalSec: number): Promise<void> {
    this.disableChaosMode();
    this._chaosModeActive = true;

    const safeRegexes = this.safePatterns
      .filter(Boolean)
      .map(p => new RegExp('^' + p.replace(/\*/g, '.*') + '$', 'i'));

    this.chaosModeInterval = setInterval(async () => {
      try {
        const containers = await this.containerService.listContainers();
        const running = containers.filter(
          c => c.state === 'running' && !safeRegexes.some(r => r.test(c.name)),
        );
        if (running.length === 0) return;

        const victim = running[Math.floor(Math.random() * running.length)];
        await this.containerService.killContainer(victim.id);
        this._killCount++;
        console.log(`Chaos Mode: killed container ${victim.name}`);
      } catch (err) {
        console.warn('Chaos Mode kill failed:', err);
      }
    }, intervalSec * 1000);
  }

  disableChaosMode(): void {
    this._chaosModeActive = false;
    if (this.chaosModeInterval) {
      clearInterval(this.chaosModeInterval);
      this.chaosModeInterval = undefined;
    }
  }

  async stopAll(): Promise<void> {
    console.log('Stopping all chaos operations and rolling back');

    this.disableChaosMode();
    await this.scheduler.rollbackAll();
    await this.networkShaper.rollbackAll();
    await this.resourceLimiter.rollbackAll();
    await this.isolator.rollbackAll();
    await this.stressInjector.rollbackAll();
    await this.configSaboteur.rollbackAll();

    this.containerService.invalidateCache();
    console.log('All chaos operations rolled back');
  }

  getState(): ChaosState {
    const networkRules = this.networkShaper.getActiveRules();
    const resourceLimits = this.resourceLimiter.getActiveLimits();
    const isolations = this.isolator.getIsolations();
    const scenarios = this.scheduler.listScenarios();
    const stressInjections = this.stressInjector.getActiveInjections();
    const configSabotages = this.configSaboteur.getActiveSabotages();

    const runningAttacks =
      Object.keys(networkRules).length +
      Object.keys(resourceLimits).length +
      Object.keys(isolations).length +
      Object.keys(stressInjections).length +
      Object.keys(configSabotages).length +
      scenarios.filter(s => s.enabled).length;

    return {
      runningAttacks,
      killCount: this._killCount,
      chaosModeActive: this._chaosModeActive,
      scenarios,
      networkRules,
      resourceLimits,
      isolations,
      stressInjections,
      configSabotages,
    };
  }

  dispose(): void {
    this.disableChaosMode();
    this.scheduler.dispose();
    this.networkShaper.dispose();
    this.resourceLimiter.dispose();
    this.isolator.dispose();
    this.stressInjector.dispose();
    this.configSaboteur.dispose();
  }
}
