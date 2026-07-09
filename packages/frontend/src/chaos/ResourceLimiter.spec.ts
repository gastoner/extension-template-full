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
import ResourceLimiter from './ResourceLimiter.svelte';
import type { ContainerHealth, ChaosState, ResourceLimit } from '../../../shared/src/ChaosApi';

vi.mock(import('../stores/chaos-store.svelte'));

const runningContainer: ContainerHealth = {
  id: 'c1',
  engineId: 'e1',
  name: 'api-server',
  image: 'node:20',
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
  vi.mocked(chaos.applyResourceLimit).mockResolvedValue();
  vi.mocked(chaos.removeResourceLimit).mockResolvedValue();
});

test('renders heading and form fields', async () => {
  render(ResourceLimiter);
  await screen.findByText('Resource Limiter');
  expect(screen.getByText('Target Container')).toBeInTheDocument();
  expect(screen.getAllByText(/CPU Cores Limit/i).length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText(/Memory Limit/i).length).toBeGreaterThanOrEqual(1);
});

test('renders Apply Resource Limit button', async () => {
  render(ResourceLimiter);
  const btn = await screen.findByRole('button', { name: /Apply Resource Limit/i });
  expect(btn).toBeInTheDocument();
});

test('shows active limits when present', async () => {
  const limits: Record<string, ResourceLimit> = {
    c2: { containerId: 'c2', cpuPercent: 50, memoryMb: 128 },
  };
  vi.mocked(chaos.getChaosState).mockResolvedValue({ ...idleState, resourceLimits: limits });
  vi.mocked(chaos.getContainerHealth).mockResolvedValue([
    runningContainer,
    { ...runningContainer, id: 'c2', name: 'limited-target' },
  ]);
  render(ResourceLimiter);
  await screen.findByText('Active Limits');
  expect(screen.getByText('limited-target')).toBeInTheDocument();
  expect(screen.getByText('RAM: 128 MB')).toBeInTheDocument();
});

test('calls removeResourceLimit when Restore is clicked', async () => {
  const limits: Record<string, ResourceLimit> = {
    c2: { containerId: 'c2', cpuPercent: 50, memoryMb: 64 },
  };
  vi.mocked(chaos.getChaosState).mockResolvedValue({ ...idleState, resourceLimits: limits });
  vi.mocked(chaos.getContainerHealth).mockResolvedValue([
    runningContainer,
    { ...runningContainer, id: 'c2', name: 'target-restore' },
  ]);
  render(ResourceLimiter);
  const btn = await screen.findByRole('button', { name: 'Restore' });
  await fireEvent.click(btn);
  expect(vi.mocked(chaos.removeResourceLimit)).toHaveBeenCalledWith('c2');
});

test('does not show active limits section when none exist', async () => {
  render(ResourceLimiter);
  await screen.findByText('Resource Limiter');
  expect(screen.queryByText('Active Limits')).toBeNull();
});
