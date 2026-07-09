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
import ScenarioActionsColumn from './ScenarioActionsColumn.svelte';
import type { ScenarioActionsCell } from './scenario-table';
import type { Scenario } from '../../../../shared/src/ChaosApi';

const onToggle = vi.fn();
const onRun = vi.fn();
const onExport = vi.fn();
const onDelete = vi.fn();

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'sc-1',
    name: 'Test Scenario',
    intervalSec: 30,
    targetStrategy: 'random',
    steps: [{ attackType: 'stop' }],
    enabled: false,
    ...overrides,
  };
}

function renderActions(scenarioOverrides: Partial<Scenario> = {}): ReturnType<typeof render> {
  const props: { object: ScenarioActionsCell } = {
    object: {
      scenario: makeScenario(scenarioOverrides),
      onToggle,
      onRun,
      onExport,
      onDelete,
    },
  };
  return render(ScenarioActionsColumn, { props });
}

beforeEach(() => {
  vi.resetAllMocks();
});

test('shows Start button when scenario is disabled', () => {
  renderActions({ enabled: false });
  screen.getByRole('button', { name: 'Start this scenario on its interval' });
});

test('shows Stop button when scenario is enabled', () => {
  renderActions({ enabled: true });
  screen.getByRole('button', { name: 'Stop this scenario and revert all its active attacks' });
});

test('renders all four action buttons', () => {
  renderActions();
  const buttons = screen.getAllByRole('button');
  expect(buttons.length).toBe(4);
});

test('calls onToggle when toggle button is clicked', async () => {
  renderActions();
  const btn = screen.getByRole('button', { name: 'Start this scenario on its interval' });
  await fireEvent.click(btn);
  expect(onToggle).toHaveBeenCalledTimes(1);
});

test('calls onRun when run-once button is clicked', async () => {
  renderActions();
  const btn = screen.getByRole('button', { name: 'Run scenario once' });
  await fireEvent.click(btn);
  expect(onRun).toHaveBeenCalledTimes(1);
});

test('calls onExport when export button is clicked', async () => {
  renderActions();
  const btn = screen.getByRole('button', { name: 'Export this scenario' });
  await fireEvent.click(btn);
  expect(onExport).toHaveBeenCalledTimes(1);
});

test('calls onDelete when delete button is clicked', async () => {
  renderActions();
  const btn = screen.getByRole('button', { name: 'Delete scenario' });
  await fireEvent.click(btn);
  expect(onDelete).toHaveBeenCalledTimes(1);
});
