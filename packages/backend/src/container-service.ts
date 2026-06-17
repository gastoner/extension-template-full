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
import type { ContainerInfo, ContainerStats } from '/@shared/src/ContainerTypes';

interface PodmanStatsEntry {
  cpu_percent?: string | number;
  CPU?: string;
  mem_usage?: string | number;
  MemUsage?: string;
  mem_limit?: string | number;
  MemLimit?: string;
  // Podman returns combined "RX / TX" strings as net_io / block_io
  net_io?: string;
  NetIO?: string;
  block_io?: string;
  BlockIO?: string;
  // Some versions use separate fields
  net_input?: string | number;
  net_output?: string | number;
  block_input?: string | number;
  block_output?: string | number;
}

export class ContainerService {
  private containerCache: ContainerInfo[] = [];
  private cacheTimestamp = 0;
  private readonly cacheTtlMs: number;
  private cpuLimitCache: Map<string, number> = new Map();

  constructor(cacheTtlMs = 5000) {
    this.cacheTtlMs = cacheTtlMs;
  }

  async listContainers(): Promise<ContainerInfo[]> {
    const now = Date.now();
    if (now - this.cacheTimestamp < this.cacheTtlMs && this.containerCache.length > 0) {
      return this.containerCache;
    }

    try {
      const containers = await extensionApi.containerEngine.listContainers();
      this.containerCache = containers.map(c => ({
        id: c.Id,
        engineId: c.engineId,
        name: c.Names?.[0]?.replace(/^\//, '') ?? c.Id.substring(0, 12),
        image: c.Image,
        status: c.Status,
        state: c.State,
      }));
    } catch (err: unknown) {
      console.warn('Failed to list containers:', err);
      this.containerCache = [];
    }

    this.cacheTimestamp = now;
    return this.containerCache;
  }

  async getStats(engineId: string, containerId: string): Promise<ContainerStats | undefined> {
    const container = this.containerCache.find(c => c.id === containerId);
    const name = container?.name ?? containerId.substring(0, 12);

    try {
      const result = await extensionApi.process.exec('podman', [
        'stats',
        '--no-stream',
        '--no-reset',
        '--format',
        'json',
        containerId,
      ]);
      const entries: PodmanStatsEntry[] = JSON.parse(result.stdout);
      if (!entries.length) return undefined;
      const s = entries[0];

      const memParts = this.splitCombinedValue(String(s.mem_usage ?? s.MemUsage ?? '0'));
      const memUsageBytes = this.parseHumanBytes(memParts[0]);
      const memLimitBytes =
        memParts.length > 1
          ? this.parseHumanBytes(memParts[1])
          : this.parseHumanBytes(s.mem_limit ?? s.MemLimit ?? '0');

      const netCombined = s.net_io ?? s.NetIO;
      let netRxBytes: number;
      let netTxBytes: number;
      if (netCombined) {
        netRxBytes = this.splitAndParse(netCombined, 0);
        netTxBytes = this.splitAndParse(netCombined, 1);
      } else {
        netRxBytes = s.net_input !== undefined ? this.parseHumanBytes(s.net_input) : 0;
        netTxBytes = s.net_output !== undefined ? this.parseHumanBytes(s.net_output) : 0;
      }

      const blockCombined = s.block_io ?? s.BlockIO;
      let blockReadBytes: number;
      let blockWriteBytes: number;
      if (blockCombined) {
        blockReadBytes = this.splitAndParse(blockCombined, 0);
        blockWriteBytes = this.splitAndParse(blockCombined, 1);
      } else {
        blockReadBytes = s.block_input !== undefined ? this.parseHumanBytes(s.block_input) : 0;
        blockWriteBytes = s.block_output !== undefined ? this.parseHumanBytes(s.block_output) : 0;
      }

      const cpuLimitPercent = await this.getCpuLimitPercent(containerId);
      const rawCpu = s.cpu_percent ?? s.CPU ?? '0';
      const cpuPercent = typeof rawCpu === 'number' ? rawCpu : parseFloat(String(rawCpu));

      return {
        id: containerId,
        name,
        cpuPercent: isNaN(cpuPercent) ? 0 : cpuPercent,
        cpuLimitPercent,
        memoryUsageMb: memUsageBytes / (1024 * 1024),
        memoryLimitMb: memLimitBytes / (1024 * 1024),
        blockReadMb: blockReadBytes / (1024 * 1024),
        blockWriteMb: blockWriteBytes / (1024 * 1024),
        netRxMb: netRxBytes / (1024 * 1024),
        netTxMb: netTxBytes / (1024 * 1024),
        timestamp: Date.now(),
      };
    } catch (err: unknown) {
      console.warn(`Failed to get stats for ${containerId}, using fallback:`, err);
      return {
        id: containerId,
        name,
        cpuPercent: 0,
        cpuLimitPercent: 0,
        memoryUsageMb: 0,
        memoryLimitMb: 0,
        blockReadMb: 0,
        blockWriteMb: 0,
        netRxMb: 0,
        netTxMb: 0,
        timestamp: Date.now(),
      };
    }
  }

  private splitCombinedValue(value: string): string[] {
    return String(value)
      .split('/')
      .map(p => p.trim());
  }

  private splitAndParse(value: string, index: number): number {
    const parts = this.splitCombinedValue(value);
    return parts.length > index ? this.parseHumanBytes(parts[index]) : 0;
  }

  async getCpuLimitPercent(containerId: string): Promise<number> {
    const cached = this.cpuLimitCache.get(containerId);
    if (cached !== undefined) return cached;

    try {
      const result = await extensionApi.process.exec('podman', [
        'inspect',
        containerId,
        '--format',
        '{{.HostConfig.NanoCpus}} {{.HostConfig.CpuQuota}} {{.HostConfig.CpuPeriod}}',
      ]);
      const parts = result.stdout.trim().split(/\s+/);
      const nanoCpus = parseInt(parts[0] ?? '0', 10) || 0;
      const cpuQuota = parseInt(parts[1] ?? '0', 10) || 0;
      const cpuPeriod = parseInt(parts[2] ?? '0', 10) || 0;

      let limitPercent = 0;
      if (nanoCpus > 0) {
        limitPercent = (nanoCpus / 1e9) * 100;
      } else if (cpuQuota > 0 && cpuPeriod > 0) {
        limitPercent = (cpuQuota / cpuPeriod) * 100;
      }

      this.cpuLimitCache.set(containerId, limitPercent);
      return limitPercent;
    } catch {
      this.cpuLimitCache.set(containerId, 0);
      return 0;
    }
  }

  private parseHumanBytes(value: string | number): number {
    if (typeof value === 'number') return value;
    const str = String(value).trim();
    if (str === '--' || str === '') return 0;
    const match = str.match(/^([\d.]+)\s*([a-zA-Z]*)/);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    if (isNaN(num)) return 0;
    const unit = match[2].toLowerCase();
    if (unit === 'gib' || unit === 'gb') return num * 1024 * 1024 * 1024;
    if (unit === 'mib' || unit === 'mb') return num * 1024 * 1024;
    if (unit === 'kib' || unit === 'kb') return num * 1024;
    if (unit === 'b' || unit === '') return num;
    return num;
  }

  async getAllStats(): Promise<ContainerStats[]> {
    const containers = await this.listContainers();
    const running = containers.filter(c => c.state === 'running');
    const stats: ContainerStats[] = [];

    for (const c of running) {
      const s = await this.getStats(c.engineId, c.id);
      if (s) {
        stats.push(s);
      }
    }

    return stats;
  }

  async stopContainer(engineId: string, containerId: string): Promise<void> {
    await extensionApi.containerEngine.stopContainer(engineId, containerId);
  }

  async startContainer(engineId: string, containerId: string): Promise<void> {
    await extensionApi.containerEngine.startContainer(engineId, containerId);
  }

  async restartContainer(engineId: string, containerId: string): Promise<void> {
    await extensionApi.containerEngine.stopContainer(engineId, containerId);
    await extensionApi.containerEngine.startContainer(engineId, containerId);
  }

  async killContainer(containerId: string): Promise<void> {
    await extensionApi.process.exec('podman', ['kill', containerId]);
  }

  async pauseContainer(containerId: string): Promise<void> {
    await extensionApi.process.exec('podman', ['pause', containerId]);
  }

  async unpauseContainer(containerId: string): Promise<void> {
    await extensionApi.process.exec('podman', ['unpause', containerId]);
  }

  async getContainerNetworks(containerId: string): Promise<string[]> {
    try {
      const result = await extensionApi.process.exec('podman', [
        'inspect',
        containerId,
        '--format',
        '{{range $key, $val := .NetworkSettings.Networks}}{{$key}} {{end}}',
      ]);
      return result.stdout.trim().split(/\s+/).filter(Boolean);
    } catch {
      return [];
    }
  }

  async disconnectFromNetwork(containerId: string, network: string): Promise<void> {
    await extensionApi.process.exec('podman', ['network', 'disconnect', network, containerId]);
  }

  async connectToNetwork(containerId: string, network: string): Promise<void> {
    await extensionApi.process.exec('podman', ['network', 'connect', network, containerId]);
  }

  async inspectContainer(containerId: string): Promise<Record<string, unknown>> {
    const result = await extensionApi.process.exec('podman', ['inspect', containerId]);
    const parsed: unknown[] = JSON.parse(result.stdout);
    return (parsed[0] as Record<string, unknown>) ?? {};
  }

  async checkToolAvailability(containerId: string, tool: string): Promise<boolean> {
    try {
      await extensionApi.process.exec('podman', [
        'exec',
        containerId,
        'sh',
        '-c',
        `PATH="$PATH:/sbin:/usr/sbin:/usr/local/sbin" command -v ${tool}`,
      ]);
      return true;
    } catch {
      return false;
    }
  }

  invalidateCache(): void {
    this.cacheTimestamp = 0;
    this.cpuLimitCache.clear();
  }
}
