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

import { render, screen, fireEvent } from '@testing-library/svelte';
import { beforeEach, expect, test, vi } from 'vitest';
import * as chaos from '../stores/chaos-store.svelte';
import NetworkShaper from './NetworkShaper.svelte';
import type { ContainerHealth, ChaosState, NetworkRule } from '../../../shared/src/ChaosApi';

vi.mock(import('../stores/chaos-store.svelte'));

const runningContainer: ContainerHealth = {
  id: 'c1',
  engineId: 'e1',
  name: 'web-app',
  image: 'nginx',
  status: 'Up',
  state: 'running',
  activeAttacks: [],
  isolated: false,
};

const idleState: ChaosState = {
  runningAttacks: 0,
  killCount: 0,
  scenarios: [],
  networkRules: {},
  resourceLimits: {},
  isolations: {},
  stressInjections: {},
  configSabotages: {},
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(chaos.getContainerHealth).mockResolvedValue([runningContainer]);
  vi.mocked(chaos.getChaosState).mockResolvedValue(idleState);
  vi.mocked(chaos.checkContainerTool).mockResolvedValue(true);
  vi.mocked(chaos.applyNetworkRule).mockResolvedValue();
  vi.mocked(chaos.removeNetworkRule).mockResolvedValue();
  vi.mocked(chaos.detectPackageManagers).mockResolvedValue([]);
});

test('renders heading and form fields', async () => {
  render(NetworkShaper);
  await screen.findByText('Network Shaper');
  expect(screen.getByText('Target Container')).toBeInTheDocument();
  expect(screen.getByText('Latency (ms)')).toBeInTheDocument();
  expect(screen.getByText('Packet Loss (%)')).toBeInTheDocument();
  expect(screen.getByText('Bandwidth (kbps)')).toBeInTheDocument();
});

test('renders Apply Network Rule button', async () => {
  render(NetworkShaper);
  const btn = await screen.findByRole('button', { name: /Apply Network Rule/i });
  expect(btn).toBeInTheDocument();
});

test('shows active rules when present', async () => {
  const rules: Record<string, NetworkRule> = {
    c2: { containerId: 'c2', latencyMs: 200, packetLossPercent: 10, bandwidthKbps: 500 },
  };
  vi.mocked(chaos.getChaosState).mockResolvedValue({ ...idleState, networkRules: rules });
  vi.mocked(chaos.getContainerHealth).mockResolvedValue([
    runningContainer,
    { ...runningContainer, id: 'c2', name: 'shaped-target' },
  ]);
  render(NetworkShaper);
  await screen.findByText('Active Rules');
  expect(screen.getByText('shaped-target')).toBeInTheDocument();
  expect(screen.getByText('200ms latency')).toBeInTheDocument();
});

test('calls removeNetworkRule when Remove is clicked', async () => {
  const rules: Record<string, NetworkRule> = {
    c2: { containerId: 'c2', latencyMs: 100 },
  };
  vi.mocked(chaos.getChaosState).mockResolvedValue({ ...idleState, networkRules: rules });
  vi.mocked(chaos.getContainerHealth).mockResolvedValue([
    runningContainer,
    { ...runningContainer, id: 'c2', name: 'target-remove' },
  ]);
  render(NetworkShaper);
  const btn = await screen.findByRole('button', { name: 'Remove' });
  await fireEvent.click(btn);
  expect(vi.mocked(chaos.removeNetworkRule)).toHaveBeenCalledWith('c2');
});

test('does not show active rules section when none exist', async () => {
  render(NetworkShaper);
  await screen.findByText('Network Shaper');
  expect(screen.queryByText('Active Rules')).toBeNull();
});
