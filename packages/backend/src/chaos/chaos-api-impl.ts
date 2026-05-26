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
import type {
  ChaosApi,
  ChaosState,
  ContainerHealth,
  IsolationRule,
  NetworkRule,
  ResourceLimit,
  Scenario,
} from '/@shared/src/ChaosApi';
import type { ChaosEngine } from './chaos-engine';
import type { ContainerService } from '../container-service';

export class ChaosApiImpl implements ChaosApi {
  constructor(
    private readonly engine: ChaosEngine,
    private readonly containerService: ContainerService,
  ) {}

  async getChaosState(): Promise<ChaosState> {
    return this.engine.getState();
  }

  async getContainerHealth(): Promise<ContainerHealth[]> {
    const containers = await this.containerService.listContainers();
    const stats = await this.containerService.getAllStats();
    const state = this.engine.getState();

    return containers.map(c => {
      const containerStats = stats.find(s => s.id === c.id);
      const isolation = state.isolations[c.id];
      const attacks: { type: string; target: string; startedAt: number }[] = [];

      if (state.networkRules[c.id]) {
        attacks.push({ type: 'network-shaping', target: c.name, startedAt: Date.now() });
      }
      if (state.resourceLimits[c.id]) {
        attacks.push({ type: 'resource-limit', target: c.name, startedAt: Date.now() });
      }
      if (isolation) {
        attacks.push({ type: `isolation-${isolation.mode}`, target: c.name, startedAt: isolation.startedAt });
      }

      return {
        id: c.id,
        engineId: c.engineId,
        name: c.name,
        image: c.image,
        status: c.status,
        state: c.state,
        stats: containerStats,
        activeAttacks: attacks,
        isolated: !!isolation,
        isolationMode: isolation?.mode,
      };
    });
  }

  async stopAllChaos(): Promise<void> {
    // -------------------------------------------------------------------------
    // #1: Show a progress task while stopping all chaos
    // Wrap the call to this.engine.stopAll() inside extensionApi.window.withProgress():
    //   - location: extensionApi.ProgressLocation.TASK_WIDGET
    //   - title: 'Stop All Chaos'
    // Inside the callback, use progress.report({ message }) to show status,
    // then call this.engine.stopAll(), then report completion with increment: 100.
    // Hint: extensionApi.window.withProgress({ location, title }, async (progress) => { ... })
    // -------------------------------------------------------------------------
    await this.engine.stopAll();
  }

  async createScenario(scenario: Scenario): Promise<void> {
    if (!scenario.id) {
      scenario.id = crypto.randomUUID();
    }
    this.engine.scheduler.addScenario(scenario);
  }

  async deleteScenario(id: string): Promise<void> {
    this.engine.scheduler.removeScenario(id);
  }

  async listScenarios(): Promise<Scenario[]> {
    return this.engine.scheduler.listScenarios();
  }

  async toggleScenario(id: string, enabled: boolean): Promise<void> {
    this.engine.scheduler.toggleScenario(id, enabled);
  }

  async applyNetworkRule(rule: NetworkRule): Promise<void> {
    await this.engine.networkShaper.applyRule(rule);
  }

  async removeNetworkRule(containerId: string): Promise<void> {
    await this.engine.networkShaper.removeRule(containerId);
  }

  async applyResourceLimit(limit: ResourceLimit): Promise<void> {
    await this.engine.resourceLimiter.applyLimit(limit);
  }

  async removeResourceLimit(containerId: string): Promise<void> {
    await this.engine.resourceLimiter.removeLimit(containerId);
  }

  async isolateContainer(rule: IsolationRule): Promise<void> {
    await this.engine.isolator.isolate(rule);
  }

  async restoreContainer(containerId: string): Promise<void> {
    await this.engine.isolator.restore(containerId);
  }

  async listIsolations(): Promise<IsolationRule[]> {
    return this.engine.isolator.listIsolations();
  }

  async getContainerNetworks(containerId: string): Promise<string[]> {
    return this.containerService.getContainerNetworks(containerId);
  }

  async checkContainerTool(containerId: string, tool: string): Promise<boolean> {
    return this.containerService.checkToolAvailability(containerId, tool);
  }

  async installContainerTool(containerId: string, tool: string): Promise<void> {
    if (!TOOL_PACKAGES[tool]) {
      throw new Error(`Unknown tool '${tool}'. Supported: ${Object.keys(TOOL_PACKAGES).join(', ')}`);
    }

    const pm = await this.detectPackageManager(containerId);
    if (!pm) {
      throw new Error(
        `Could not detect a package manager (apt-get, dnf, yum, apk, microdnf) in the container.`,
      );
    }

    const pkg = this.resolvePackageName(tool, pm);
    const installCmd = this.buildInstallCommand(pm, pkg);
    await extensionApi.process.exec('podman', [
      'exec', containerId, 'sh', '-c', installCmd,
    ]);
  }

  private async detectPackageManager(containerId: string): Promise<string | undefined> {
    for (const pm of ['apt-get', 'dnf', 'microdnf', 'yum', 'apk']) {
      try {
        await extensionApi.process.exec('podman', [
          'exec', containerId, 'sh', '-c', `command -v ${pm}`,
        ]);
        return pm;
      } catch {
        // not found, try next
      }
    }
    return undefined;
  }

  private resolvePackageName(tool: string, pm: string): string {
    const pmFamily = (pm === 'dnf' || pm === 'microdnf' || pm === 'yum') ? 'rpm' :
                     (pm === 'apk') ? 'apk' : 'deb';
    return TOOL_PACKAGES[tool]?.[pmFamily] ?? TOOL_PACKAGES[tool]?.deb ?? tool;
  }

  private buildInstallCommand(pm: string, pkg: string): string {
    switch (pm) {
      case 'apt-get':
        return `apt-get update -qq && apt-get install -y -qq ${pkg}`;
      case 'dnf':
      case 'microdnf':
        return `${pm} install -y ${pkg}`;
      case 'yum':
        return `yum install -y ${pkg}`;
      case 'apk':
        return `apk add --no-cache ${pkg}`;
      default:
        return `${pm} install ${pkg}`;
    }
  }
}

const TOOL_PACKAGES: Record<string, Record<string, string>> = {
  tc:       { deb: 'iproute2', rpm: 'iproute-tc', apk: 'iproute2' },
  iptables: { deb: 'iptables', rpm: 'iptables',   apk: 'iptables' },
};
