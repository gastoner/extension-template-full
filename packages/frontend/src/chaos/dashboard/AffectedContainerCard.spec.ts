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
import { goto } from '$app/navigation';
import AffectedContainerCard from './AffectedContainerCard.svelte';
import type { AffectedContainerState, ContainerHealth } from '../../../../shared/src/ChaosApi';

const onrevert = vi.fn();

function makeEntry(overrides: Partial<AffectedContainerState> = {}): AffectedContainerState {
  return {
    containerId: 'abc123',
    containerName: 'my-container',
    engineId: 'e1',
    firstAffectedAt: Date.now(),
    originalState: { wasRunning: true, networks: ['bridge'], cpuNanos: 0, memoryBytes: 0 },
    activeAttacks: ['network-shape'],
    ...overrides,
  };
}

function makeHealth(overrides: Partial<ContainerHealth> = {}): ContainerHealth {
  return {
    id: 'abc123',
    engineId: 'e1',
    name: 'my-container',
    image: 'nginx:latest',
    status: 'Up 5 minutes',
    state: 'running',
    activeAttacks: [],
    isolated: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

test('renders the container name', () => {
  render(AffectedContainerCard, { props: { entry: makeEntry(), health: makeHealth(), onrevert } });
  screen.getByText('my-container');
});

test('renders the container image when health is provided', () => {
  render(AffectedContainerCard, {
    props: { entry: makeEntry(), health: makeHealth({ image: 'redis:7' }), onrevert },
  });
  screen.getByText('redis:7');
});

test('renders active attack badges', () => {
  render(AffectedContainerCard, {
    props: {
      entry: makeEntry({ activeAttacks: ['network-shape', 'resource-limit'] }),
      health: makeHealth(),
      onrevert,
    },
  });
  screen.getByText('network-shape');
  screen.getByText('resource-limit');
});

test('shows collapsed attack count when more than 2 attacks', () => {
  render(AffectedContainerCard, {
    props: {
      entry: makeEntry({ activeAttacks: ['a', 'b', 'c'] }),
      health: makeHealth(),
      onrevert,
    },
  });
  screen.getByText('3 attacks');
});

test('renders Revert button', () => {
  render(AffectedContainerCard, { props: { entry: makeEntry(), health: makeHealth(), onrevert } });
  screen.getByRole('button', { name: 'Revert' });
});

test('calls onrevert when Revert is clicked', async () => {
  render(AffectedContainerCard, { props: { entry: makeEntry(), health: makeHealth(), onrevert } });
  await fireEvent.click(screen.getByRole('button', { name: 'Revert' }));
  expect(onrevert).toHaveBeenCalledTimes(1);
});

test('navigates to container detail page when card is clicked', async () => {
  const entry = makeEntry({ containerId: 'xyz789' });
  const { container } = render(AffectedContainerCard, {
    props: { entry, health: makeHealth(), onrevert },
  });
  const card = container.querySelector('button');
  await fireEvent.click(card!);
  expect(vi.mocked(goto)).toHaveBeenCalledWith('/chaos/container/xyz789');
});

test('Revert click does not trigger card navigation', async () => {
  render(AffectedContainerCard, { props: { entry: makeEntry(), health: makeHealth(), onrevert } });
  await fireEvent.click(screen.getByRole('button', { name: 'Revert' }));
  expect(vi.mocked(goto)).not.toHaveBeenCalled();
});

test('handles undefined health gracefully', () => {
  render(AffectedContainerCard, { props: { entry: makeEntry(), health: undefined, onrevert } });
  screen.getByText('my-container');
});
