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

import { beforeEach, expect, test, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AffectedRegistry } from './affected-registry';
import type { ContainerService } from '../container-service';

const mockContainerService = {
  listContainers: vi.fn(),
  getContainerNetworks: vi.fn(),
  inspectContainer: vi.fn(),
} as unknown as ContainerService;

let registry: AffectedRegistry;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(mockContainerService.listContainers).mockResolvedValue([
    { id: 'container-1', name: 'web-app', state: 'running', engineId: 'e1' },
  ] as Awaited<ReturnType<ContainerService['listContainers']>>);
  vi.mocked(mockContainerService.getContainerNetworks).mockResolvedValue(['bridge']);
  vi.mocked(mockContainerService.inspectContainer).mockResolvedValue({
    HostConfig: { NanoCpus: 2000000000, Memory: 536870912 },
  });

  registry = new AffectedRegistry(mockContainerService);
});

test('markAffected: should create a new entry capturing original container state', async () => {
  await registry.markAffected('container-1', 'resource-limit');

  const entry = registry.getEntry('container-1');
  expect(entry).toBeDefined();
  expect(entry?.containerName).toBe('web-app');
  expect(entry?.activeAttacks).toEqual(['resource-limit']);
  expect(entry?.originalState).toEqual({
    wasRunning: true,
    networks: ['bridge'],
    cpuNanos: 2000000000,
    memoryBytes: 536870912,
  });
});

test('markAffected: should append a new attack type to an existing entry', async () => {
  await registry.markAffected('container-1', 'resource-limit');
  await registry.markAffected('container-1', 'network-shape');

  expect(registry.getEntry('container-1')?.activeAttacks).toEqual(['resource-limit', 'network-shape']);
});

test('markAffected: should not duplicate the same attack type', async () => {
  await registry.markAffected('container-1', 'resource-limit');
  await registry.markAffected('container-1', 'resource-limit');

  expect(registry.getEntry('container-1')?.activeAttacks).toEqual(['resource-limit']);
});

test('markAffected: should not re-capture original state for an already-affected container', async () => {
  await registry.markAffected('container-1', 'resource-limit');
  vi.mocked(mockContainerService.inspectContainer).mockClear();

  await registry.markAffected('container-1', 'network-shape');

  expect(mockContainerService.inspectContainer).not.toHaveBeenCalled();
});

test('removeAttack: should remove only the given attack type, keeping others', async () => {
  await registry.markAffected('container-1', 'resource-limit');
  await registry.markAffected('container-1', 'network-shape');

  await registry.removeAttack('container-1', 'resource-limit');

  expect(registry.getEntry('container-1')?.activeAttacks).toEqual(['network-shape']);
});

test('removeAttack: should keep the entry (with an empty attack list) rather than deleting it', async () => {
  await registry.markAffected('container-1', 'resource-limit');

  await registry.removeAttack('container-1', 'resource-limit');

  expect(registry.getEntry('container-1')).toBeDefined();
  expect(registry.getEntry('container-1')?.activeAttacks).toEqual([]);
});

test('removeAttack: should no-op gracefully for a container with no entry', async () => {
  await expect(registry.removeAttack('nonexistent', 'resource-limit')).resolves.not.toThrow();
});

test('has: should reflect whether a container has an entry', async () => {
  expect(registry.has('container-1')).toBe(false);

  await registry.markAffected('container-1', 'resource-limit');

  expect(registry.has('container-1')).toBe(true);
});

test('clearContainer: should remove the entry entirely', async () => {
  await registry.markAffected('container-1', 'resource-limit');

  await registry.clearContainer('container-1');

  expect(registry.getEntry('container-1')).toBeUndefined();
});

test('clear: should remove all entries', async () => {
  await registry.markAffected('container-1', 'resource-limit');

  await registry.clear();

  expect(registry.getAffected()).toHaveLength(0);
});

test('save/load: should persist an affected entry and reload it into a new instance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-affected-'));
  try {
    registry.setStoragePath(dir);
    await registry.markAffected('container-1', 'resource-limit');

    const reloaded = new AffectedRegistry(mockContainerService);
    reloaded.setStoragePath(dir);
    await reloaded.load();

    expect(reloaded.getEntry('container-1')?.activeAttacks).toEqual(['resource-limit']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should persist removeAttack changes so a reload does not see stale attacks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-affected-'));
  try {
    registry.setStoragePath(dir);
    await registry.markAffected('container-1', 'resource-limit');
    await registry.removeAttack('container-1', 'resource-limit');

    const reloaded = new AffectedRegistry(mockContainerService);
    reloaded.setStoragePath(dir);
    await reloaded.load();

    expect(reloaded.getEntry('container-1')?.activeAttacks).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should persist clearContainer removals', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-affected-'));
  try {
    registry.setStoragePath(dir);
    await registry.markAffected('container-1', 'resource-limit');
    await registry.clearContainer('container-1');

    const reloaded = new AffectedRegistry(mockContainerService);
    reloaded.setStoragePath(dir);
    await reloaded.load();

    expect(reloaded.getEntry('container-1')).toBeUndefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('onChanged: should notify listeners after markAffected, removeAttack, clearContainer, and clear', async () => {
  const listener = vi.fn();
  registry.onChanged(listener);

  await registry.markAffected('container-1', 'resource-limit');
  expect(listener).toHaveBeenCalledTimes(1);

  await registry.removeAttack('container-1', 'resource-limit');
  expect(listener).toHaveBeenCalledTimes(2);

  await registry.markAffected('container-1', 'network-shape');
  await registry.clearContainer('container-1');
  expect(listener).toHaveBeenCalledTimes(4);

  await registry.markAffected('container-1', 'resource-limit');
  await registry.clear();
  expect(listener).toHaveBeenCalledTimes(6);
});

test('save/load: should start fresh if no persisted file exists', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-affected-'));
  try {
    registry.setStoragePath(dir);
    await expect(registry.load()).resolves.not.toThrow();
    expect(registry.getAffected()).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should skip malformed persisted entries without crashing, keeping the valid ones', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-affected-'));
  try {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const valid = {
      containerId: 'container-valid',
      containerName: 'web',
      engineId: 'e1',
      firstAffectedAt: Date.now(),
      originalState: { wasRunning: true, networks: ['bridge'], cpuNanos: 0, memoryBytes: 0 },
      activeAttacks: ['resource-limit'],
    };
    const malformed = { containerId: 'container-bad', activeAttacks: ['resource-limit'] }; // missing originalState etc.
    writeFileSync(join(dir, 'affected-containers.json'), JSON.stringify([valid, malformed]), 'utf8');

    registry.setStoragePath(dir);
    await registry.load();

    expect(registry.getAffected().map(e => e.containerId)).toEqual(['container-valid']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('affected-containers.json'));

    warnSpy.mockRestore();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
