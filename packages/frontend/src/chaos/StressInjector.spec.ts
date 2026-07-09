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
import StressInjector from './StressInjector.svelte';
import type { ContainerHealth, StressInjection } from '../../../shared/src/ChaosApi';

vi.mock(import('../stores/chaos-store.svelte'));

const runningContainer: ContainerHealth = {
  id: 'c1',
  engineId: 'e1',
  name: 'worker',
  image: 'python:3',
  status: 'Up',
  state: 'running',
  activeAttacks: [],
  isolated: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(chaos.getContainerHealth).mockResolvedValue([runningContainer]);
  vi.mocked(chaos.listStressInjections).mockResolvedValue([]);
  vi.mocked(chaos.injectStress).mockResolvedValue();
  vi.mocked(chaos.stopStress).mockResolvedValue();
});

test('renders heading and form fields', async () => {
  render(StressInjector);
  await screen.findByText('Stress Injector');
  expect(screen.getByText('Target Container')).toBeInTheDocument();
  expect(screen.getByText('Stress Type')).toBeInTheDocument();
});

test('renders Inject Stress button', async () => {
  render(StressInjector);
  const btn = await screen.findByRole('button', { name: /Inject Stress/i });
  expect(btn).toBeInTheDocument();
});

test('shows active injections when present', async () => {
  const injection: StressInjection = {
    containerId: 'c2',
    containerName: 'stressed-target',
    type: 'cpu',
    workers: 2,
    startedAt: Date.now() - 60000,
  };
  vi.mocked(chaos.listStressInjections).mockResolvedValue([injection]);
  render(StressInjector);
  await screen.findByText('Active Injections');
  expect(screen.getByText('stressed-target')).toBeInTheDocument();
  expect(screen.getByText('cpu')).toBeInTheDocument();
});

test('calls stopStress when Stop is clicked', async () => {
  const injection: StressInjection = {
    containerId: 'c2',
    containerName: 'stressed-target',
    type: 'cpu',
    startedAt: Date.now(),
  };
  vi.mocked(chaos.listStressInjections).mockResolvedValue([injection]);
  render(StressInjector);
  const btn = await screen.findByRole('button', { name: 'Stop' });
  await fireEvent.click(btn);
  expect(vi.mocked(chaos.stopStress)).toHaveBeenCalledWith('c2');
});

test('does not show active injections section when none exist', async () => {
  render(StressInjector);
  await screen.findByText('Stress Injector');
  expect(screen.queryByText('Active Injections')).toBeNull();
});
