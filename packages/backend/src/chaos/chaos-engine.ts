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

export class ChaosEngine {
  readonly scheduler: ScenarioScheduler;
  readonly networkShaper: NetworkShaper;
  readonly resourceLimiter: ResourceLimiter;
  readonly isolator: ContainerIsolator;

  constructor(private readonly containerService: ContainerService) {
    this.networkShaper = new NetworkShaper(containerService);
    this.resourceLimiter = new ResourceLimiter(containerService);
    this.isolator = new ContainerIsolator(containerService);
    this.scheduler = new ScenarioScheduler(containerService, this.networkShaper, this.resourceLimiter);
  }

  setSafePatterns(patterns: string[]): void {
    this.scheduler.setSafePatterns(patterns);
    this.networkShaper.setSafePatterns(patterns);
    this.resourceLimiter.setSafePatterns(patterns);
    this.isolator.setSafePatterns(patterns);
  }

  async stopAll(): Promise<void> {
    console.log('Stopping all chaos operations and rolling back');

    await this.scheduler.rollbackAll();
    await this.networkShaper.rollbackAll();
    await this.resourceLimiter.rollbackAll();
    await this.isolator.rollbackAll();

    this.containerService.invalidateCache();
    console.log('All chaos operations rolled back');
  }

  getState(): ChaosState {
    const networkRules = this.networkShaper.getActiveRules();
    const resourceLimits = this.resourceLimiter.getActiveLimits();
    const isolations = this.isolator.getIsolations();
    const scenarios = this.scheduler.listScenarios();

    const runningAttacks =
      Object.keys(networkRules).length +
      Object.keys(resourceLimits).length +
      Object.keys(isolations).length +
      scenarios.filter(s => s.enabled).length;

    return {
      runningAttacks,
      scenarios,
      networkRules,
      resourceLimits,
      isolations,
    };
  }

  dispose(): void {
    this.scheduler.dispose();
    this.networkShaper.dispose();
    this.resourceLimiter.dispose();
    this.isolator.dispose();
  }
}
