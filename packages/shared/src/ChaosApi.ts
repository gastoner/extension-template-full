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

import type { ContainerStats } from './ContainerTypes';

export type AttackType =
  | 'stop'
  | 'kill'
  | 'pause'
  | 'restart'
  | 'network-shape'
  | 'resource-limit'
  | 'network-disconnect';

export interface ScenarioStep {
  attackType: AttackType;
  delaySec?: number;
  targetContainerIds?: string[];
  latencyMs?: number;
  packetLossPercent?: number;
  bandwidthKbps?: number;
  cpuPercent?: number;
  memoryMb?: number;
  disconnectNetworks?: string[];
}

export interface Scenario {
  id: string;
  name: string;
  intervalSec: number;
  targetStrategy: 'random' | 'specific' | 'all';
  targetIds?: string[];
  steps: ScenarioStep[];
  enabled: boolean;
}

export interface NetworkRule {
  containerId: string;
  latencyMs?: number;
  packetLossPercent?: number;
  bandwidthKbps?: number;
  dnsBlock?: string[];
}

export interface ResourceLimit {
  containerId: string;
  cpuPercent: number;
  memoryMb: number;
}

export interface IsolationRule {
  containerId: string;
  containerName: string;
  mode: 'pause' | 'network-disconnect' | 'network-partition';
  partitionPeers?: string[];
  disconnectedNetworks?: string[];
  autoRestoreAfterSec?: number;
  startedAt: number;
}

export interface Attack {
  type: string;
  target: string;
  startedAt: number;
}

export interface ContainerHealth {
  id: string;
  engineId: string;
  name: string;
  image: string;
  status: string;
  state: string;
  stats?: ContainerStats;
  activeAttacks: Attack[];
  isolated: boolean;
  isolationMode?: string;
}

export interface ChaosState {
  runningAttacks: number;
  scenarios: Scenario[];
  networkRules: Record<string, NetworkRule>;
  resourceLimits: Record<string, ResourceLimit>;
  isolations: Record<string, IsolationRule>;
}

export abstract class ChaosApi {
  abstract getChaosState(): Promise<ChaosState>;
  abstract getContainerHealth(): Promise<ContainerHealth[]>;
  abstract stopAllChaos(): Promise<void>;

  abstract createScenario(scenario: Scenario): Promise<void>;
  abstract deleteScenario(id: string): Promise<void>;
  abstract listScenarios(): Promise<Scenario[]>;
  abstract toggleScenario(id: string, enabled: boolean): Promise<void>;

  abstract applyNetworkRule(rule: NetworkRule): Promise<void>;
  abstract removeNetworkRule(containerId: string): Promise<void>;

  abstract applyResourceLimit(limit: ResourceLimit): Promise<void>;
  abstract removeResourceLimit(containerId: string): Promise<void>;

  abstract isolateContainer(rule: IsolationRule): Promise<void>;
  abstract restoreContainer(containerId: string): Promise<void>;
  abstract listIsolations(): Promise<IsolationRule[]>;
  abstract getContainerNetworks(containerId: string): Promise<string[]>;

  abstract checkContainerTool(containerId: string, tool: string): Promise<boolean>;
  abstract installContainerTool(containerId: string, tool: string): Promise<void>;
}
