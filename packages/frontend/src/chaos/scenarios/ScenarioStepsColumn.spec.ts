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
import { expect, test, vi } from 'vitest';
import ScenarioStepsColumn from './ScenarioStepsColumn.svelte';
import type { ScenarioStepsCell } from './scenario-table';
import type { ScenarioStep } from '../../../../shared/src/ChaosApi';

function makeProps(steps: ScenarioStep[]): { object: ScenarioStepsCell } {
  return {
    object: {
      steps,
      summarize: vi.fn((s: ScenarioStep) => `summary-${s.attackType}`),
      label: vi.fn((s: ScenarioStep) => s.attackType),
    },
  };
}

test('renders numbered labels for each step', () => {
  const steps: ScenarioStep[] = [{ attackType: 'stop' }, { attackType: 'kill' }];
  render(ScenarioStepsColumn, { props: makeProps(steps) });
  screen.getByText('1. stop');
  screen.getByText('2. kill');
});

test('renders single step', () => {
  render(ScenarioStepsColumn, { props: makeProps([{ attackType: 'pause' }]) });
  screen.getByText('1. pause');
});

test('renders nothing when steps array is empty', () => {
  const { container } = render(ScenarioStepsColumn, { props: makeProps([]) });
  const spans = container.querySelectorAll('span');
  expect(spans.length).toBe(0);
});
