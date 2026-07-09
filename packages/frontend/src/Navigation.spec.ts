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
import Navigation from './Navigation.svelte';

vi.mock('@podman-desktop/ui-svelte/icons', () => ({
  Icon: () => {},
}));

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

test('renders the Chaos Lab header text', async () => {
  render(Navigation);
  expect(screen.getByText('Chaos Lab')).toBeInTheDocument();
});

test('renders all navigation entries', async () => {
  render(Navigation);
  expect(screen.getByLabelText('Dashboard')).toBeInTheDocument();
  expect(screen.getByLabelText('Scenarios')).toBeInTheDocument();
  expect(screen.getByLabelText('Network Shaper')).toBeInTheDocument();
  expect(screen.getByLabelText('Resource Limiter')).toBeInTheDocument();
  expect(screen.getByLabelText('Container Isolator')).toBeInTheDocument();
  expect(screen.getByLabelText('Stress Injector')).toBeInTheDocument();
  expect(screen.getByLabelText('Config Sabotage')).toBeInTheDocument();
});

test('renders navigation links with correct href', async () => {
  render(Navigation);
  const dashboardLink = screen.getByLabelText('Dashboard');
  expect(dashboardLink.closest('a')).toHaveAttribute('href', '/chaos');

  const scenariosLink = screen.getByLabelText('Scenarios');
  expect(scenariosLink.closest('a')).toHaveAttribute('href', '/chaos/scenarios');
});

test('has resize handle with correct aria attributes', async () => {
  render(Navigation);
  const handle = screen.getByRole('separator');
  expect(handle).toBeInTheDocument();
  expect(handle).toHaveAttribute('aria-label', 'Resize navigation bar');
});

test('renders nav element with correct aria-label', async () => {
  render(Navigation);
  const nav = screen.getByLabelText('ChaosLabNavigation');
  expect(nav).toBeInTheDocument();
});
