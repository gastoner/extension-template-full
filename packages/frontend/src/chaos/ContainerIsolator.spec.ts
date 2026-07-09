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
import ContainerIsolator from './ContainerIsolator.svelte';
import type { ContainerHealth, IsolationRule } from '../../../shared/src/ChaosApi';

vi.mock(import('../stores/chaos-store.svelte'));

const runningContainer: ContainerHealth = {
  id: 'c1',
  engineId: 'e1',
  name: 'my-app',
  image: 'app:1',
  status: 'Up',
  state: 'running',
  activeAttacks: [],
  isolated: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(chaos.getContainerHealth).mockResolvedValue([runningContainer]);
  vi.mocked(chaos.listIsolations).mockResolvedValue([]);
  vi.mocked(chaos.getContainerNetworks).mockResolvedValue(['bridge']);
  vi.mocked(chaos.checkContainerTool).mockResolvedValue(true);
  vi.mocked(chaos.detectPackageManagers).mockResolvedValue([]);
  vi.mocked(chaos.isolateContainer).mockResolvedValue();
  vi.mocked(chaos.restoreContainer).mockResolvedValue();
});

test('renders heading and form fields', async () => {
  render(ContainerIsolator);
  await screen.findByText('Container Isolator');
  expect(screen.getByText('Target Container')).toBeInTheDocument();
  expect(screen.getByText('Isolation Mode')).toBeInTheDocument();
});

test('renders Isolate Container button', async () => {
  render(ContainerIsolator);
  const btn = await screen.findByRole('button', { name: /Isolate Container/i });
  expect(btn).toBeInTheDocument();
});

test('shows active isolations when present', async () => {
  const iso: IsolationRule = {
    containerId: 'c2',
    containerName: 'isolated-target',
    mode: 'pause',
    startedAt: Date.now() - 30000,
  };
  vi.mocked(chaos.listIsolations).mockResolvedValue([iso]);
  render(ContainerIsolator);
  await screen.findByText('Active Isolations');
  expect(screen.getByText('isolated-target')).toBeInTheDocument();
  expect(screen.getByText('pause')).toBeInTheDocument();
});

test('calls restoreContainer when Restore is clicked on an isolation', async () => {
  const iso: IsolationRule = {
    containerId: 'c2',
    containerName: 'isolated-target',
    mode: 'pause',
    startedAt: Date.now(),
  };
  vi.mocked(chaos.listIsolations).mockResolvedValue([iso]);
  render(ContainerIsolator);
  const btn = await screen.findByRole('button', { name: 'Restore' });
  await fireEvent.click(btn);
  expect(vi.mocked(chaos.restoreContainer)).toHaveBeenCalledWith('c2');
});

test('shows Restore All button when isolations exist', async () => {
  const iso: IsolationRule = {
    containerId: 'c2',
    containerName: 'isolated-target',
    mode: 'pause',
    startedAt: Date.now(),
  };
  vi.mocked(chaos.listIsolations).mockResolvedValue([iso]);
  render(ContainerIsolator);
  const btn = await screen.findByRole('button', { name: 'Restore All' });
  expect(btn).toBeInTheDocument();
});

test('does not show active isolations section when none exist', async () => {
  render(ContainerIsolator);
  await screen.findByText('Container Isolator');
  expect(screen.queryByText('Active Isolations')).toBeNull();
});
