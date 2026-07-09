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

import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as chaos from '../../stores/chaos-store.svelte';
import ContainerDetail from './ContainerDetail.svelte';
import type { ContainerHealth } from '../../../../shared/src/ChaosApi';

vi.mock(import('../../stores/chaos-store.svelte'));
vi.mock('../../lib/UPlotChart.svelte', () => ({ default: () => {} }));

const container: ContainerHealth = {
  id: 'abc123',
  engineId: 'e1',
  name: 'my-container',
  image: 'nginx:latest',
  status: 'Up 2 hours',
  state: 'running',
  activeAttacks: [{ type: 'network-shaping', target: 'c1', startedAt: Date.now() }],
  isolated: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.mocked(chaos.getContainerHealth).mockResolvedValue([container]);
  vi.mocked(chaos.refresh).mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

test('renders container name and image in details page', async () => {
  render(ContainerDetail, { props: { containerId: 'abc123' } });
  expect(await screen.findByRole('heading', { name: 'my-container' })).toBeInTheDocument();
});

test('shows status card', async () => {
  render(ContainerDetail, { props: { containerId: 'abc123' } });
  await screen.findByRole('heading', { name: 'my-container' });
  expect(screen.getByText('Status')).toBeInTheDocument();
  expect(screen.getByText('running')).toBeInTheDocument();
});

test('shows active attack badges', async () => {
  render(ContainerDetail, { props: { containerId: 'abc123' } });
  await screen.findByRole('heading', { name: 'my-container' });
  expect(screen.getByText('network-shaping')).toBeInTheDocument();
});

test('shows not-found message for unknown container ID', async () => {
  vi.mocked(chaos.getContainerHealth).mockResolvedValue([]);
  render(ContainerDetail, { props: { containerId: 'unknown' } });
  expect(await screen.findByText(/Container not found/)).toBeInTheDocument();
});

test('shows isolated badge when container is isolated', async () => {
  const isolated: ContainerHealth = {
    ...container,
    isolated: true,
    isolationMode: 'pause',
  };
  vi.mocked(chaos.getContainerHealth).mockResolvedValue([isolated]);
  render(ContainerDetail, { props: { containerId: 'abc123' } });
  expect(await screen.findByText('pause')).toBeInTheDocument();
});
