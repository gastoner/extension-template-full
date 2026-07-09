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
import { faPlay } from '@fortawesome/free-solid-svg-icons';
import ListItemButtonIcon from './ListItemButtonIcon.svelte';

beforeEach(() => {
  vi.resetAllMocks();
});

test('renders a button with the given title as aria-label', () => {
  render(ListItemButtonIcon, { props: { title: 'Run it', icon: faPlay } });
  const btn = screen.getByRole('button', { name: 'Run it' });
  expect(btn).toBeInTheDocument();
});

test('calls onClick when clicked', async () => {
  const onClick = vi.fn();
  render(ListItemButtonIcon, { props: { title: 'Go', icon: faPlay, onClick } });
  await fireEvent.click(screen.getByRole('button', { name: 'Go' }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test('is disabled when enabled is false', () => {
  render(ListItemButtonIcon, { props: { title: 'Nope', icon: faPlay, enabled: false } });
  const btn = screen.getByRole('button', { name: 'Nope' });
  expect(btn).toBeDisabled();
});

test('is disabled when inProgress is true', () => {
  render(ListItemButtonIcon, { props: { title: 'Loading', icon: faPlay, inProgress: true } });
  const btn = screen.getByRole('button', { name: 'Loading' });
  expect(btn).toBeDisabled();
});

test('is hidden when hidden prop is true', () => {
  render(ListItemButtonIcon, { props: { title: 'Secret', icon: faPlay, hidden: true } });
  const btn = screen.getByRole('button', { name: 'Secret', hidden: true });
  expect(btn.classList.contains('hidden')).toBe(true);
});
