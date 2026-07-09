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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AffectedContainerState,
  ChaosApi,
  ChaosState,
  ConfigSabotage,
  ContainerHealth,
  IsolationRule,
  NetworkRule,
  ResourceLimit,
  SabotageType,
  Scenario,
  StressInjection,
  StressType,
} from '/@shared/src/ChaosApi';
import type { ChaosEngine } from './chaos-engine';
import type { ContainerService } from '../container-service';
import { ScenarioSchema, parsePersistedArray } from './persistence-schemas';

const SCENARIO_EXPORT_FILE_NAME = 'chaos-scenarios.json';

export class ChaosApiImpl implements ChaosApi {
  private notificationsEnabled = true;

  constructor(
    private readonly engine: ChaosEngine,
    private readonly containerService: ContainerService,
  ) {}

  async setNotificationsEnabled(enabled: boolean): Promise<void> {
    this.notificationsEnabled = enabled;
  }

  private notify(message: string, warn = false): void {
    if (!this.notificationsEnabled) return;
    if (warn) {
      void extensionApi.window.showWarningMessage(message, 'OK');
    } else {
      void extensionApi.window.showInformationMessage(message, 'OK');
    }
  }

  private async resolveContainerName(containerId: string): Promise<string> {
    const containers = await this.containerService.listContainers();
    return containers.find(c => c.id === containerId)?.name ?? containerId.substring(0, 12);
  }

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
      if (state.stressInjections[c.id]) {
        attacks.push({
          type: `stress-${state.stressInjections[c.id].type}`,
          target: c.name,
          startedAt: state.stressInjections[c.id].startedAt,
        });
      }
      if (state.configSabotages[c.id]) {
        attacks.push({
          type: `config-${state.configSabotages[c.id].type}`,
          target: c.name,
          startedAt: state.configSabotages[c.id].startedAt,
        });
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
        progress.report({ message: 'Stopping all chaos operations...' });
        await new Promise(resolve => setTimeout(resolve, 1500));
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
    await this.engine.scheduler.save();
    this.notify(`Scenario '${scenario.name}' created`);
  }

  async deleteScenario(id: string): Promise<void> {
    this.engine.scheduler.removeScenario(id);
    await this.engine.scheduler.save();
  }

  async listScenarios(): Promise<Scenario[]> {
    return this.engine.scheduler.listScenarios();
  }

  async toggleScenario(id: string, enabled: boolean): Promise<void> {
    await this.engine.scheduler.toggleScenario(id, enabled);
    await this.engine.scheduler.save();

    const scenario = this.engine.scheduler.listScenarios().find(s => s.id === id);
    if (!scenario) return;
    this.notify(
      enabled
        ? `Scenario '${scenario.name}' started`
        : `Scenario '${scenario.name}' stopped and its active attacks reverted`,
      true,
    );
  }

  async runScenarioOnce(id: string): Promise<void> {
    await this.engine.scheduler.runOnce(id);
    this.notify('Scenario executed', true);
  }

  async exportScenarios(ids?: string[]): Promise<void> {
    const allScenarios = this.engine.scheduler.listScenarios();
    const scenarios = ids ? allScenarios.filter(s => ids.includes(s.id)) : allScenarios;
    if (scenarios.length === 0) {
      this.notify('No scenarios to export', true);
      return;
    }

    const defaultUri = extensionApi.Uri.file(path.join(os.homedir(), 'Documents', SCENARIO_EXPORT_FILE_NAME));

    const target = await extensionApi.window.showSaveDialog({
      defaultUri,
      saveLabel: 'Export',
      title: 'Export Chaos Scenarios',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!target) return;

    try {
      await fs.promises.writeFile(target.fsPath, JSON.stringify(scenarios, undefined, 2), 'utf8');
      this.notify(`Exported ${scenarios.length} scenario(s) to ${target.fsPath}`);
    } catch (err) {
      this.notify(`Failed to export scenarios: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  }

  async importScenarios(): Promise<void> {
    const defaultUri = extensionApi.Uri.file(path.join(os.homedir(), 'Documents'));

    const selection = await extensionApi.window.showOpenDialog({
      defaultUri,
      openLabel: 'Import',
      title: 'Import Chaos Scenarios',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!selection || selection.length === 0) return;

    let scenarios: Scenario[];
    try {
      const raw = await fs.promises.readFile(selection[0].fsPath, 'utf8');
      scenarios = parsePersistedArray(JSON.parse(raw), ScenarioSchema, 'imported scenarios file');
    } catch (err) {
      this.notify(`Failed to read scenarios file: ${err instanceof Error ? err.message : String(err)}`, true);
      return;
    }

    if (scenarios.length === 0) {
      this.notify('No valid scenarios found in the selected file', true);
      return;
    }

    for (const scenario of scenarios) {
      // Always mint a fresh id and start disabled: imported scenarios are treated as new
      // additions rather than overwrites of anything already scheduled, and shouldn't start
      // firing attacks on an interval before the user has had a chance to review them.
      scenario.id = crypto.randomUUID();
      scenario.enabled = false;
      this.engine.scheduler.addScenario(scenario);
    }
    await this.engine.scheduler.save();
    this.notify(`Imported ${scenarios.length} scenario(s)`);
  }

  async applyNetworkRule(rule: NetworkRule): Promise<void> {
    await this.engine.networkShaper.applyRule(rule);
    const name = await this.resolveContainerName(rule.containerId);
    const parts: string[] = [];
    if (rule.latencyMs) parts.push(`${rule.latencyMs}ms latency`);
    if (rule.packetLossPercent) parts.push(`${rule.packetLossPercent}% loss`);
    if (rule.bandwidthKbps) parts.push(`${rule.bandwidthKbps}kbps bandwidth`);
    this.notify(`Network rule applied to ${name}: ${parts.join(', ')}`, true);
  }

  async removeNetworkRule(containerId: string): Promise<void> {
    await this.engine.networkShaper.removeRule(containerId);
  }

  async applyResourceLimit(limit: ResourceLimit): Promise<void> {
    await this.engine.resourceLimiter.applyLimit(limit);
    const name = await this.resolveContainerName(limit.containerId);
    const parts = [`${(limit.cpuPercent / 100).toFixed(2)} CPU cores`, `${limit.memoryMb} MB RAM`];
    if (limit.deviceReadBpsKB) parts.push(`${limit.deviceReadBpsKB} KB/s read`);
    if (limit.deviceWriteBpsKB) parts.push(`${limit.deviceWriteBpsKB} KB/s write`);
    this.notify(`Resource limit on ${name}: ${parts.join(', ')}`, true);
  }

  async removeResourceLimit(containerId: string): Promise<void> {
    await this.engine.resourceLimiter.removeLimit(containerId);
  }

  async isolateContainer(rule: IsolationRule): Promise<void> {
    await this.engine.isolator.isolate(rule);
    this.notify(`Container ${rule.containerName} isolated (${rule.mode})`, true);
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

  async detectPackageManagers(containerId: string): Promise<string[]> {
    return this.detectAllPackageManagers(containerId);
  }

  async installContainerTool(containerId: string, tool: string, packageManager: string): Promise<void> {
    if (!TOOL_PACKAGES[tool]) {
      throw new Error(`Unknown tool '${tool}'. Supported: ${Object.keys(TOOL_PACKAGES).join(', ')}`);
    }

    const pkg = this.resolvePackageName(tool, packageManager);
    const installCmd = this.buildInstallCommand(packageManager, pkg);
    await extensionApi.process.exec('podman', ['exec', containerId, 'sh', '-c', installCmd]);
  }

  async injectStress(containerId: string, type: StressType, workers?: number, targetMb?: number): Promise<void> {
    await this.engine.stressInjector.inject(containerId, type, workers, targetMb);
    const name = await this.resolveContainerName(containerId);
    this.notify(`${type} stress injected into ${name}`, true);
  }

  async stopStress(containerId: string): Promise<void> {
    await this.engine.stressInjector.stop(containerId);
  }

  async listStressInjections(): Promise<StressInjection[]> {
    return this.engine.stressInjector.listInjections();
  }

  async corruptConfig(containerId: string, type: SabotageType, targetFile?: string): Promise<void> {
    await this.engine.configSaboteur.corrupt(containerId, type, targetFile);
    const name = await this.resolveContainerName(containerId);
    this.notify(`Config sabotage (${type}) applied to ${name}`, true);
  }

  async restoreConfig(containerId: string): Promise<void> {
    await this.engine.configSaboteur.restore(containerId);
  }

  async listConfigSabotages(): Promise<ConfigSabotage[]> {
    return this.engine.configSaboteur.listSabotages();
  }

  async getAffectedContainers(): Promise<AffectedContainerState[]> {
    return this.engine.affectedRegistry.getAffected();
  }

  async revertContainer(containerId: string): Promise<void> {
    const state = this.engine.getState();

    if (state.isolations[containerId]) {
      await this.engine.isolator.restore(containerId);
    }
    if (state.networkRules[containerId]) {
      await this.engine.networkShaper.removeRule(containerId);
    }
    if (state.resourceLimits[containerId]) {
      await this.engine.resourceLimiter.removeLimit(containerId);
    }
    if (state.stressInjections[containerId]) {
      await this.engine.stressInjector.stop(containerId);
    }
    if (state.configSabotages[containerId]) {
      await this.engine.configSaboteur.restore(containerId);
    }

    const entry = this.engine.affectedRegistry.getEntry(containerId);
    if (!entry) return;

    if (entry.originalState.wasRunning) {
      try {
        await this.containerService.startContainer(entry.engineId, containerId);
      } catch {
        // may already be running
      }
    }

    if (entry.originalState.cpuNanos > 0 || entry.originalState.memoryBytes > 0) {
      try {
        const args = ['update', containerId];
        if (entry.originalState.cpuNanos > 0) {
          args.push('--cpus', (entry.originalState.cpuNanos / 1e9).toFixed(2));
        } else {
          args.push('--cpus', '0');
        }
        if (entry.originalState.memoryBytes > 0) {
          const memMb = Math.ceil(entry.originalState.memoryBytes / (1024 * 1024));
          args.push('--memory', `${memMb}m`);
        } else {
          args.push('--memory', '0');
        }
        await extensionApi.process.exec('podman', args);
      } catch {
        // restore may fail if container is not running
      }
    }

    for (const network of entry.originalState.networks) {
      try {
        await this.containerService.connectToNetwork(containerId, network);
      } catch {
        // may already be connected
      }
    }

    await this.engine.affectedRegistry.clearContainer(containerId);
    this.notify(`Container ${entry.containerName} reverted to default state`);
  }

  async revertAllContainers(): Promise<void> {
    // Equivalent to clicking "Restore" on every affected container card: reverts each
    // container individually via revertContainer() rather than taking an engine-wide
    // shortcut, so the two code paths can never drift out of sync with each other.
    const affected = this.engine.affectedRegistry.getAffected();
    for (const entry of affected) {
      await this.revertContainer(entry.containerId);
    }
    this.notify('All affected containers reverted to default state');
  }

  private async detectAllPackageManagers(containerId: string): Promise<string[]> {
    const found: string[] = [];
    for (const pm of ['apt-get', 'dnf', 'microdnf', 'yum', 'apk']) {
      try {
        await extensionApi.process.exec('podman', ['exec', containerId, 'sh', '-c', `command -v ${pm}`]);
        found.push(pm);
      } catch {
        // not found, try next
      }
    }
    return found;
  }

  private resolvePackageName(tool: string, pm: string): string {
    const pmFamily = pm === 'dnf' || pm === 'microdnf' || pm === 'yum' ? 'rpm' : pm === 'apk' ? 'apk' : 'deb';
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
  tc: { deb: 'iproute2', rpm: 'iproute-tc', apk: 'iproute2' },
  iptables: { deb: 'iptables', rpm: 'iptables', apk: 'iptables' },
};
