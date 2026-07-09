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
import ConfigSabotage from './ConfigSabotage.svelte';
import type { ContainerHealth, ConfigSabotage as ConfigSabotageType } from '../../../shared/src/ChaosApi';

vi.mock(import('../stores/chaos-store.svelte'));

const runningContainer: ContainerHealth = {
  id: 'c1',
  engineId: 'e1',
  name: 'db-server',
  image: 'postgres:16',
  status: 'Up',
  state: 'running',
  activeAttacks: [],
  isolated: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(chaos.getContainerHealth).mockResolvedValue([runningContainer]);
  vi.mocked(chaos.listConfigSabotages).mockResolvedValue([]);
  vi.mocked(chaos.corruptConfig).mockResolvedValue();
  vi.mocked(chaos.restoreConfig).mockResolvedValue();
});

test('renders heading and form fields', async () => {
  render(ConfigSabotage);
  await screen.findByText('Config Sabotage');
  expect(screen.getByText('Target Container')).toBeInTheDocument();
  expect(screen.getByText('Sabotage Type')).toBeInTheDocument();
});

test('renders Apply Sabotage button', async () => {
  render(ConfigSabotage);
  const btn = await screen.findByRole('button', { name: /Apply Sabotage/i });
  expect(btn).toBeInTheDocument();
});

test('shows active sabotages when present', async () => {
  const sabotage: ConfigSabotageType = {
    containerId: 'c2',
    containerName: 'sabotaged-target',
    type: 'dns-blackhole',
    targetFile: '/etc/resolv.conf',
    startedAt: Date.now() - 5000,
  };
  vi.mocked(chaos.listConfigSabotages).mockResolvedValue([sabotage]);
  render(ConfigSabotage);
  await screen.findByText('Active Sabotages');
  expect(screen.getByText('sabotaged-target')).toBeInTheDocument();
  expect(screen.getByText('dns-blackhole')).toBeInTheDocument();
  expect(screen.getAllByText('/etc/resolv.conf').length).toBeGreaterThanOrEqual(1);
});

test('calls restoreConfig when Restore is clicked', async () => {
  const sabotage: ConfigSabotageType = {
    containerId: 'c2',
    containerName: 'sabotaged-target',
    type: 'file-corrupt',
    targetFile: '/etc/hostname',
    startedAt: Date.now(),
  };
  vi.mocked(chaos.listConfigSabotages).mockResolvedValue([sabotage]);
  render(ConfigSabotage);
  const btn = await screen.findByRole('button', { name: 'Restore' });
  await fireEvent.click(btn);
  expect(vi.mocked(chaos.restoreConfig)).toHaveBeenCalledWith('c2');
});

test('does not show active sabotages section when none exist', async () => {
  render(ConfigSabotage);
  await screen.findByText('Config Sabotage');
  expect(screen.queryByText('Active Sabotages')).toBeNull();
});
