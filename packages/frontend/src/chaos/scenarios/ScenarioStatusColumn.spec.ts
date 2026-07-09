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
import ScenarioStatusColumn from './ScenarioStatusColumn.svelte';

test('renders Running title when enabled', () => {
  render(ScenarioStatusColumn, { props: { object: true } });
  expect(screen.getByTitle('Running')).toBeInTheDocument();
  expect(screen.getByTitle('RUNNING')).toBeInTheDocument();
});

test('renders Stopped title when disabled', () => {
  render(ScenarioStatusColumn, { props: { object: false } });
  expect(screen.getByTitle('Stopped')).toBeInTheDocument();
  expect(screen.getByTitle('STOPPED')).toBeInTheDocument();
});
