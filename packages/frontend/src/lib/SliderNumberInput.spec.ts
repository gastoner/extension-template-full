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
import SliderNumberInput from './SliderNumberInput.svelte';

test('renders a range slider with correct min/max/step', () => {
  render(SliderNumberInput, { props: { value: 50, minimum: 10, maximum: 200, step: 5, label: 'CPU' } });
  const slider = screen.getByRole('slider', { name: 'CPU' });
  expect(slider).toHaveAttribute('min', '10');
  expect(slider).toHaveAttribute('max', '200');
  expect(slider).toHaveAttribute('step', '5');
});

test('renders a number input with the label', () => {
  render(SliderNumberInput, { props: { value: 42, label: 'Memory' } });
  const slider = screen.getByRole('slider', { name: 'Memory' });
  expect(slider).toBeInTheDocument();
});

test('applies default min/max/step when not specified', () => {
  render(SliderNumberInput, { props: { value: 50 } });
  const slider = screen.getByRole('slider');
  expect(slider).toHaveAttribute('min', '0');
  expect(slider).toHaveAttribute('max', '100');
  expect(slider).toHaveAttribute('step', '1');
});
