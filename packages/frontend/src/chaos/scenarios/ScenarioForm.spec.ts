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
import ScenarioForm from './ScenarioForm.svelte';
import type { ContainerHealth } from '../../../../shared/src/ChaosApi';

vi.mock(import('../../stores/chaos-store.svelte'));

const oncancel = vi.fn();
const oncreated = vi.fn();
const onerror = vi.fn();

const containers: ContainerHealth[] = [
  {
    id: 'c1',
    engineId: 'e1',
    name: 'web-server',
    image: 'nginx:latest',
    status: 'Up',
    state: 'running',
    activeAttacks: [],
    isolated: false,
  },
  {
    id: 'c2',
    engineId: 'e1',
    name: 'stopped-db',
    image: 'postgres:16',
    status: 'Exited',
    state: 'exited',
    activeAttacks: [],
    isolated: false,
  },
];

function renderForm(props: Partial<{ containers: ContainerHealth[] }> = {}): void {
  render(ScenarioForm, {
    props: { containers: props.containers ?? containers, oncancel, oncreated, onerror },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(chaos.createScenario).mockResolvedValue();
});

test('renders form heading and basic fields', () => {
  renderForm();
  screen.getByRole('heading', { name: 'Create Scenario' });
  screen.getByPlaceholderText('My Chaos Scenario');
  screen.getByText('Interval (sec)');
  screen.getByText('Target Strategy');
});

test('renders Cancel and Create Scenario buttons', () => {
  renderForm();
  screen.getByRole('button', { name: 'Cancel' });
  screen.getByRole('button', { name: 'Create Scenario' });
});

test('calls oncancel when Cancel is clicked', async () => {
  renderForm();
  await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(oncancel).toHaveBeenCalledTimes(1);
});

test('calls createScenario and oncreated on submit', async () => {
  renderForm();
  await fireEvent.click(screen.getByRole('button', { name: 'Create Scenario' }));
  expect(vi.mocked(chaos.createScenario)).toHaveBeenCalledTimes(1);
  expect(oncreated).toHaveBeenCalledTimes(1);
});

test('submits with default name Unnamed Scenario when name is empty', async () => {
  renderForm();
  await fireEvent.click(screen.getByRole('button', { name: 'Create Scenario' }));

  const call = vi.mocked(chaos.createScenario).mock.calls[0][0];
  expect(call.name).toBe('Unnamed Scenario');
  expect(call.enabled).toBe(false);
  expect(call.steps.length).toBe(1);
  expect(call.steps[0].attackType).toBe('stop');
});

test('calls onerror when createScenario rejects', async () => {
  vi.mocked(chaos.createScenario).mockRejectedValueOnce(new Error('network down'));
  renderForm();
  await fireEvent.click(screen.getByRole('button', { name: 'Create Scenario' }));

  expect(onerror).toHaveBeenCalledTimes(1);
  expect(onerror.mock.calls[0][0]).toContain('network down');
  expect(oncreated).not.toHaveBeenCalled();
});

test('renders at least one step editor', () => {
  renderForm();
  screen.getByText('Step 1');
  screen.getByText('Attack Type');
});

test('renders Add Step button', () => {
  renderForm();
  screen.getByRole('button', { name: /Add Step/i });
});
