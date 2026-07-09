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
import { expect, test } from 'vitest';
import ScenarioNameColumn from './ScenarioNameColumn.svelte';

test('renders the scenario name', () => {
  render(ScenarioNameColumn, { props: { object: 'Kill Random Pods' } });
  screen.getByText('Kill Random Pods');
});

test('truncates long names with ellipsis via CSS class', () => {
  render(ScenarioNameColumn, { props: { object: 'A very long scenario name that should be truncated' } });
  const el = screen.getByText('A very long scenario name that should be truncated');
  expect(el.classList.contains('text-ellipsis')).toBe(true);
  expect(el.classList.contains('overflow-hidden')).toBe(true);
  expect(el.classList.contains('whitespace-nowrap')).toBe(true);
});
