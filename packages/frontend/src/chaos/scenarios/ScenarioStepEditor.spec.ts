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
import { beforeEach, expect, test, vi } from 'vitest';
import ScenarioStepEditor from './ScenarioStepEditor.svelte';
import { createDefaultStep } from './scenario-table';
import type { StepForm } from './scenario-table';
import type { ContainerHealth } from '../../../../shared/src/ChaosApi';

const onremove = vi.fn();

const runningContainers: ContainerHealth[] = [
  {
    id: 'c1',
    engineId: 'e1',
    name: 'my-nginx',
    image: 'nginx:latest',
    status: 'Up 5 minutes',
    state: 'running',
    activeAttacks: [],
    isolated: false,
  },
  {
    id: 'c2',
    engineId: 'e1',
    name: 'my-redis',
    image: 'redis:7',
    status: 'Up 10 minutes',
    state: 'running',
    activeAttacks: [],
    isolated: false,
  },
];

function renderEditor(overrides: Partial<StepForm> = {}, opts: { removable?: boolean; index?: number } = {}): void {
  const step: StepForm = { ...createDefaultStep(), ...overrides };
  render(ScenarioStepEditor, {
    props: {
      step,
      index: opts.index ?? 0,
      removable: opts.removable ?? false,
      runningContainers,
      onremove,
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

test('displays the step number header', () => {
  renderEditor({}, { index: 2 });
  screen.getByText('Step 3');
});

test('renders Attack Type and Delay labels', () => {
  renderEditor();
  screen.getByText('Attack Type');
  screen.getByText('Delay before step (sec)');
});

test('hides remove button when not removable', () => {
  renderEditor({}, { removable: false });
  expect(screen.queryByTitle('Remove step')).toBeNull();
});

test('shows remove button when removable', () => {
  renderEditor({}, { removable: true });
  screen.getByTitle('Remove step');
});

test('shows network shaping fields when attackType is network-shape', () => {
  renderEditor({ attackType: 'network-shape' });
  screen.getByText('Latency (ms)');
  screen.getByText('Packet Loss (%)');
  screen.getByText('Bandwidth (kbps)');
});

test('hides network shaping fields for non-network attack types', () => {
  renderEditor({ attackType: 'stop' });
  expect(screen.queryByText('Latency (ms)')).toBeNull();
  expect(screen.queryByText('Packet Loss (%)')).toBeNull();
});

test('shows resource limit fields when attackType is resource-limit', () => {
  renderEditor({ attackType: 'resource-limit' });
  screen.getByText(/CPU Cores/);
  screen.getByText('Memory (MB)');
});

test('hides resource limit fields for non-resource attack types', () => {
  renderEditor({ attackType: 'kill' });
  expect(screen.queryByText(/CPU Cores/)).toBeNull();
  expect(screen.queryByText('Memory (MB)')).toBeNull();
});

test('does not show container override list when overrideTargets is false', () => {
  renderEditor({ overrideTargets: false });
  expect(screen.queryByText('my-nginx')).toBeNull();
  expect(screen.queryByText('my-redis')).toBeNull();
});

test('shows container override list when overrideTargets is true', () => {
  renderEditor({ overrideTargets: true });
  screen.getByText('my-nginx');
  screen.getByText('my-redis');
});

test('shows no-containers message when overrideTargets is true but list is empty', () => {
  const step: StepForm = { ...createDefaultStep(), overrideTargets: true };
  render(ScenarioStepEditor, {
    props: { step, index: 0, removable: false, runningContainers: [], onremove },
  });
  screen.getByText('No running containers available.');
});
