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
    await extensionApi.window.withProgress(
      { location: extensionApi.ProgressLocation.TASK_WIDGET, title: 'Stop All Chaos' },
      async progress => {
        progress.report({ message: 'Rolling back all chaos operations...' });
        await this.engine.stopAll();
        progress.report({ increment: 100, message: 'All chaos operations stopped' });
      },
    );
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
    const name = await this.resolveContainerName(rule.containerId);
    await extensionApi.window.withProgress(
      { location: extensionApi.ProgressLocation.TASK_WIDGET, title: `Network Shaping: ${name}` },
      async progress => {
        progress.report({ message: 'Applying network rule...' });
        await this.engine.networkShaper.applyRule(rule);
        const parts: string[] = [];
        if (rule.latencyMs) parts.push(`${rule.latencyMs}ms latency`);
        if (rule.packetLossPercent) parts.push(`${rule.packetLossPercent}% loss`);
        if (rule.bandwidthKbps) parts.push(`${rule.bandwidthKbps} kbps`);
        progress.report({ increment: 100, message: parts.join(', ') || 'Applied' });
      },
    );
  }

  async removeNetworkRule(containerId: string): Promise<void> {
    const name = await this.resolveContainerName(containerId);
    await extensionApi.window.withProgress(
      { location: extensionApi.ProgressLocation.TASK_WIDGET, title: `Remove Network Rule: ${name}` },
      async progress => {
        progress.report({ message: 'Removing network rule...' });
        await this.engine.networkShaper.removeRule(containerId);
        progress.report({ increment: 100, message: 'Network rule removed' });
      },
    );
  }

  async applyResourceLimit(limit: ResourceLimit): Promise<void> {
    const name = await this.resolveContainerName(limit.containerId);
    await extensionApi.window.withProgress(
      { location: extensionApi.ProgressLocation.TASK_WIDGET, title: `Resource Limit: ${name}` },
      async progress => {
        progress.report({ message: 'Applying resource limit...' });
        await this.engine.resourceLimiter.applyLimit(limit);
        progress.report({
          increment: 100,
          message: `CPU: ${(limit.cpuPercent / 100).toFixed(2)} cores, RAM: ${limit.memoryMb} MB`,
        });
      },
    );
  }

  async removeResourceLimit(containerId: string): Promise<void> {
    const name = await this.resolveContainerName(containerId);
    await extensionApi.window.withProgress(
      { location: extensionApi.ProgressLocation.TASK_WIDGET, title: `Restore Resources: ${name}` },
      async progress => {
        progress.report({ message: 'Restoring original limits...' });
        await this.engine.resourceLimiter.removeLimit(containerId);
        progress.report({ increment: 100, message: 'Original limits restored' });
      },
    );
  }

  async isolateContainer(rule: IsolationRule): Promise<void> {
    await extensionApi.window.withProgress(
      { location: extensionApi.ProgressLocation.TASK_WIDGET, title: `Isolate: ${rule.containerName}` },
      async progress => {
        progress.report({ message: `Applying ${rule.mode} isolation...` });
        await this.engine.isolator.isolate(rule);
        const autoRestore = rule.autoRestoreAfterSec
          ? ` (auto-restore in ${rule.autoRestoreAfterSec}s)`
          : '';
        progress.report({ increment: 100, message: `${rule.mode} isolation active${autoRestore}` });
      },
    );
  }

  async restoreContainer(containerId: string): Promise<void> {
    const name = await this.resolveContainerName(containerId);
    await extensionApi.window.withProgress(
      { location: extensionApi.ProgressLocation.TASK_WIDGET, title: `Restore: ${name}` },
      async progress => {
        progress.report({ message: 'Restoring container...' });
        await this.engine.isolator.restore(containerId);
        progress.report({ increment: 100, message: 'Container restored from isolation' });
      },
    );
  }

  private async resolveContainerName(containerId: string): Promise<string> {
    try {
      const containers = await this.containerService.listContainers();
      return containers.find(c => c.id === containerId)?.name ?? containerId.substring(0, 12);
    } catch {
      return containerId.substring(0, 12);
    }
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

    await extensionApi.window.withProgress(
      { location: extensionApi.ProgressLocation.TASK_WIDGET, title: `Installing ${tool}` },
      async progress => {
        progress.report({ message: `Detecting package manager in container...` });
        const pm = await this.detectPackageManager(containerId);
        if (!pm) {
          throw new Error(
            `Could not detect a package manager (apt-get, dnf, yum, apk, microdnf) in the container.`,
          );
        }

        const pkg = this.resolvePackageName(tool, pm);
        const installCmd = this.buildInstallCommand(pm, pkg);
        progress.report({ message: `Running: ${installCmd}` });
        await extensionApi.process.exec('podman', [
          'exec', containerId, 'sh', '-c', installCmd,
        ]);
        progress.report({ increment: 100, message: `${tool} installed successfully` });
      },
    );
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
