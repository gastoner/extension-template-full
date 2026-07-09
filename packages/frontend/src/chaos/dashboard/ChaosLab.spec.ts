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
import * as chaos from '../../stores/chaos-store.svelte';
import ChaosLab from './ChaosLab.svelte';
import type { ChaosState, ContainerHealth, AffectedContainerState } from '../../../../shared/src/ChaosApi';

vi.mock(import('../../stores/chaos-store.svelte'));

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

const runningContainer: ContainerHealth = {
  id: 'c1',
  engineId: 'e1',
  name: 'web-app',
  image: 'nginx:latest',
  status: 'Up 5m',
  state: 'running',
  activeAttacks: [],
  isolated: false,
};

const affectedEntry: AffectedContainerState = {
  containerId: 'c1',
  containerName: 'web-app',
  engineId: 'e1',
  firstAffectedAt: Date.now(),
  originalState: { wasRunning: true, networks: ['bridge'], cpuNanos: 0, memoryBytes: 0 },
  activeAttacks: ['network-shape'],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(chaos.getChaosState).mockResolvedValue(idleState);
  vi.mocked(chaos.getContainerHealth).mockResolvedValue([runningContainer]);
  vi.mocked(chaos.getAffectedContainers).mockResolvedValue([]);
  vi.mocked(chaos.isolateContainer).mockResolvedValue();
  vi.mocked(chaos.revertAllContainers).mockResolvedValue();
  vi.mocked(chaos.revertContainer).mockResolvedValue();
});

test('renders dashboard heading', async () => {
  render(ChaosLab);
  await screen.findByText('Chaos Lab Dashboard');
});

test('shows empty state when no active containers', async () => {
  render(ChaosLab);
  await screen.findByText('No chaos in progress');
});

test('shows IDLE badge when runningAttacks is 0', async () => {
  render(ChaosLab);
  await screen.findByText('IDLE');
});

test('shows ACTIVE badge when attacks are running', async () => {
  vi.mocked(chaos.getChaosState).mockResolvedValue({ ...idleState, runningAttacks: 3 });
  vi.mocked(chaos.getAffectedContainers).mockResolvedValue([affectedEntry]);
  render(ChaosLab);
  await screen.findByText('3 ACTIVE');
});

test('shows KILLED count badge when killCount > 0', async () => {
  vi.mocked(chaos.getChaosState).mockResolvedValue({ ...idleState, killCount: 5 });
  render(ChaosLab);
  await screen.findByText('5 KILLED');
});

test('shows Start making chaos button when no affected containers', async () => {
  render(ChaosLab);
  await screen.findByRole('button', { name: /Start making chaos/i });
});

test('calls isolateContainer when Start making chaos is clicked', async () => {
  render(ChaosLab);
  const btn = await screen.findByRole('button', { name: /Start making chaos/i });
  await fireEvent.click(btn);
  expect(vi.mocked(chaos.isolateContainer)).toHaveBeenCalledTimes(1);
});

test('shows Stop All Chaos button when attacks are running', async () => {
  vi.mocked(chaos.getChaosState).mockResolvedValue({ ...idleState, runningAttacks: 1 });
  vi.mocked(chaos.getAffectedContainers).mockResolvedValue([affectedEntry]);
  render(ChaosLab);
  await screen.findByRole('button', { name: /Stop All Chaos/i });
});

test('calls revertAllContainers when Stop All Chaos is clicked', async () => {
  vi.mocked(chaos.getChaosState).mockResolvedValue({ ...idleState, runningAttacks: 1 });
  vi.mocked(chaos.getAffectedContainers).mockResolvedValue([affectedEntry]);
  render(ChaosLab);
  const btn = await screen.findByRole('button', { name: /Stop All Chaos/i });
  await fireEvent.click(btn);
  expect(vi.mocked(chaos.revertAllContainers)).toHaveBeenCalledTimes(1);
});

test('renders affected container cards', async () => {
  vi.mocked(chaos.getChaosState).mockResolvedValue({ ...idleState, runningAttacks: 1 });
  vi.mocked(chaos.getAffectedContainers).mockResolvedValue([affectedEntry]);
  render(ChaosLab);
  await screen.findByText('web-app');
});

test('disables Start making chaos when no running containers', async () => {
  vi.mocked(chaos.getContainerHealth).mockResolvedValue([]);
  render(ChaosLab);
  const btn = await screen.findByRole('button', { name: /Start making chaos/i });
  expect(btn).toBeDisabled();
});
