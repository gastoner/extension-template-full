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

import type * as extensionApi from '@podman-desktop/api';
import type { ChaosState } from '/@shared/src/ChaosApi';
import type { ContainerService } from '../container-service';
import { ScenarioScheduler } from './scenario-scheduler';
import { NetworkShaper } from './network-shaper';
import { ResourceLimiter } from './resource-limiter';
import { ContainerIsolator } from './container-isolator';
import { StressInjector } from './stress-injector';
import { ConfigSaboteur } from './config-saboteur';
import { AffectedRegistry } from './affected-registry';

export class ChaosEngine {
  readonly scheduler: ScenarioScheduler;
  readonly networkShaper: NetworkShaper;
  readonly resourceLimiter: ResourceLimiter;
  readonly isolator: ContainerIsolator;
  readonly stressInjector: StressInjector;
  readonly configSaboteur: ConfigSaboteur;
  readonly affectedRegistry: AffectedRegistry;

  private _killCount = 0;
  private safePatterns: string[] = [];
  private stateChangeListeners: Array<() => void> = [];

  constructor(private readonly containerService: ContainerService) {
    this.affectedRegistry = new AffectedRegistry(containerService);
    this.networkShaper = new NetworkShaper(containerService);
    this.resourceLimiter = new ResourceLimiter(containerService);
    this.isolator = new ContainerIsolator(containerService);
    this.stressInjector = new StressInjector(containerService);
    this.configSaboteur = new ConfigSaboteur(containerService);
    this.scheduler = new ScenarioScheduler(containerService, this.networkShaper, this.resourceLimiter, this);

    this.networkShaper.setRegistry(this.affectedRegistry);
    this.resourceLimiter.setRegistry(this.affectedRegistry);
    this.isolator.setRegistry(this.affectedRegistry);
    this.stressInjector.setRegistry(this.affectedRegistry);
    this.configSaboteur.setRegistry(this.affectedRegistry);
    this.scheduler.setStressInjector(this.stressInjector);
    this.scheduler.setConfigSaboteur(this.configSaboteur);

    // The registry is touched by every subsystem on every attack apply/remove, so
    // forwarding its change notifications here covers all attack types with one hook.
    this.affectedRegistry.onChanged(() => this.notifyStateChanged());
  }

  get killCount(): number {
    return this._killCount;
  }

  incrementKillCount(): void {
    this._killCount++;
    this.notifyStateChanged();
  }

  /** Notified whenever getState() output may have changed (attacks, scenarios, kill count). */
  onStateChanged(listener: () => void): void {
    this.stateChangeListeners.push(listener);
  }

  notifyStateChanged(): void {
    for (const listener of this.stateChangeListeners) {
      listener();
    }
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

  setStoragePath(storagePath: string): void {
    this.affectedRegistry.setStoragePath(storagePath);
    this.scheduler.setStoragePath(storagePath);
    this.networkShaper.setStoragePath(storagePath);
    this.resourceLimiter.setStoragePath(storagePath);
    this.isolator.setStoragePath(storagePath);
    this.stressInjector.setStoragePath(storagePath);
    this.configSaboteur.setStoragePath(storagePath);
  }

  setSecretStorage(secrets: extensionApi.SecretStorage): void {
    this.configSaboteur.setSecretStorage(secrets);
  }

  async loadPersistedState(): Promise<void> {
    await this.affectedRegistry.load();
    await this.scheduler.load();
    await this.networkShaper.load();
    await this.resourceLimiter.load();
    await this.isolator.load();
    await this.stressInjector.load();
    await this.configSaboteur.load();
  }

  async stopAll(): Promise<void> {
    console.log('Stopping all chaos operations and rolling back');

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
      scenarios,
      networkRules,
      resourceLimits,
      isolations,
      stressInjections,
      configSabotages,
    };
  }

  dispose(): void {
    this.scheduler.dispose();
    this.networkShaper.dispose();
    this.resourceLimiter.dispose();
    this.isolator.dispose();
    this.stressInjector.dispose();
    this.configSaboteur.dispose();
    this.stateChangeListeners = [];
  }
}
