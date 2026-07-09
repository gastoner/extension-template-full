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
import { process } from '@podman-desktop/api';
import { ResourceLimiter } from './resource-limiter';
import type { ContainerService } from '../container-service';
import type { AffectedRegistry } from './affected-registry';
import type { ResourceLimit } from '/@shared/src/ChaosApi';

const mockExec = vi.mocked(process.exec);

const mockContainerService = {
  listContainers: vi.fn(),
  inspectContainer: vi.fn(),
  invalidateCache: vi.fn(),
} as unknown as ContainerService;

const mockRegistry = {
  markAffected: vi.fn(),
  removeAttack: vi.fn(),
} as unknown as AffectedRegistry;

let limiter: ResourceLimiter;

function makeLimit(overrides: Partial<ResourceLimit> = {}): ResourceLimit {
  return {
    containerId: 'container-1',
    cpuPercent: 50,
    memoryMb: 128,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockExec.mockResolvedValue({ stdout: '', stderr: '', command: '' });
  vi.mocked(mockContainerService.listContainers).mockResolvedValue([
    { id: 'container-1', name: 'web-app', state: 'running', engineId: 'e1' },
    { id: 'container-2', name: 'api-srv', state: 'running', engineId: 'e1' },
  ] as Awaited<ReturnType<ContainerService['listContainers']>>);
  vi.mocked(mockContainerService.inspectContainer).mockResolvedValue({
    HostConfig: { NanoCpus: 2000000000, Memory: 536870912 },
  });
  vi.mocked(mockRegistry.markAffected).mockResolvedValue(undefined);
  vi.mocked(mockRegistry.removeAttack).mockResolvedValue(undefined);

  limiter = new ResourceLimiter(mockContainerService);
  limiter.setRegistry(mockRegistry);
});

test.each([
  { cpuPercent: 50, memoryMb: 128, expectedCpu: '0.50', expectedMem: '128m' },
  { cpuPercent: 100, memoryMb: 512, expectedCpu: '1.00', expectedMem: '512m' },
  { cpuPercent: 25, memoryMb: 64, expectedCpu: '0.25', expectedMem: '64m' },
])(
  'applyLimit: should call podman update with cpu=$expectedCpu memory=$expectedMem',
  async ({ cpuPercent, memoryMb, expectedCpu, expectedMem }) => {
    await limiter.applyLimit(makeLimit({ cpuPercent, memoryMb }));

    expect(mockExec).toHaveBeenCalledWith(
      'podman',
      expect.arrayContaining(['update', '--cpus', expectedCpu, '--memory', expectedMem, 'container-1']),
    );
  },
);

test.each([
  { option: 'deviceReadBpsKB', flag: '--device-read-bps', value: 500, expected: '/dev/sda:500kb' },
  { option: 'deviceWriteBpsKB', flag: '--device-write-bps', value: 200, expected: '/dev/sda:200kb' },
])('applyLimit: should include $flag when $option is specified', async ({ option, flag, value, expected }) => {
  await limiter.applyLimit(makeLimit({ [option]: value }));

  expect(mockExec).toHaveBeenCalledWith('podman', expect.arrayContaining([flag, expected]));
});

test('applyLimit: should save original limits from container inspect', async () => {
  await limiter.applyLimit(makeLimit());

  expect(mockContainerService.inspectContainer).toHaveBeenCalledWith('container-1');
});

test('applyLimit: should not re-inspect if already has original limits cached', async () => {
  await limiter.applyLimit(makeLimit());
  vi.mocked(mockContainerService.inspectContainer).mockClear();

  await limiter.applyLimit(makeLimit({ cpuPercent: 25 }));

  expect(mockContainerService.inspectContainer).not.toHaveBeenCalled();
});

test('applyLimit: should track the limit as active', async () => {
  await limiter.applyLimit(makeLimit());

  const active = limiter.getActiveLimits();
  expect(active['container-1']).toBeDefined();
  expect(active['container-1'].cpuPercent).toBe(50);
});

test('applyLimit: should reject safe-listed containers', async () => {
  limiter.setSafePatterns(['web*']);

  await expect(limiter.applyLimit(makeLimit())).rejects.toThrow('is in the safe list');
});

test('applyLimit: should mark the container as affected only after the limit is successfully applied', async () => {
  await limiter.applyLimit(makeLimit());

  expect(mockRegistry.markAffected).toHaveBeenCalledTimes(1);
  expect(mockRegistry.markAffected).toHaveBeenCalledWith('container-1', 'resource-limit');
});

test('applyLimit: should not mark the container as affected if the podman update exec fails', async () => {
  mockExec.mockRejectedValueOnce(new Error('podman update failed'));

  await expect(limiter.applyLimit(makeLimit())).rejects.toThrow('podman update failed');

  expect(mockRegistry.markAffected).not.toHaveBeenCalled();
});

test.each([
  {
    description: 'NanoCpus=2e9, Memory=512MB',
    hostConfig: { NanoCpus: 2000000000, Memory: 536870912 },
    expectedCpu: '2.00',
    expectedMem: '512m',
  },
  {
    description: 'unlimited (both 0)',
    hostConfig: { NanoCpus: 0, Memory: 0 },
    expectedCpu: '0',
    expectedMem: '0',
  },
])(
  'removeLimit: restoring original values should restore when original was $description',
  async ({ hostConfig, expectedCpu, expectedMem }) => {
    vi.mocked(mockContainerService.inspectContainer).mockResolvedValue({
      HostConfig: hostConfig,
    });

    await limiter.applyLimit(makeLimit());
    mockExec.mockClear();

    await limiter.removeLimit('container-1');

    expect(mockExec).toHaveBeenCalledWith(
      'podman',
      expect.arrayContaining(['update', 'container-1', '--cpus', expectedCpu, '--memory', expectedMem]),
    );
  },
);

test('removeLimit: should clear active limit entry after restore', async () => {
  await limiter.applyLimit(makeLimit());
  await limiter.removeLimit('container-1');

  expect(limiter.getActiveLimits()['container-1']).toBeUndefined();
});

test('removeLimit: should no-op gracefully if no original limits stored', async () => {
  await expect(limiter.removeLimit('nonexistent')).resolves.not.toThrow();
});

test('removeLimit: should handle exec failure gracefully', async () => {
  await limiter.applyLimit(makeLimit());
  mockExec.mockRejectedValueOnce(new Error('podman failed'));

  await expect(limiter.removeLimit('container-1')).resolves.not.toThrow();
  expect(limiter.getActiveLimits()['container-1']).toBeUndefined();
});

test('rollbackAll: should restore all active limits', async () => {
  await limiter.applyLimit(makeLimit({ containerId: 'container-1' }));
  await limiter.applyLimit(makeLimit({ containerId: 'container-2' }));

  await limiter.rollbackAll();

  expect(Object.keys(limiter.getActiveLimits())).toHaveLength(0);
});

test('dispose: should clear tracking without exec calls', async () => {
  await limiter.applyLimit(makeLimit());
  mockExec.mockClear();

  limiter.dispose();

  expect(Object.keys(limiter.getActiveLimits())).toHaveLength(0);
  expect(mockExec).not.toHaveBeenCalled();
});

test('save/load: should persist original limits so a reloaded instance restores correctly', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-resource-'));
  try {
    vi.mocked(mockContainerService.inspectContainer).mockResolvedValue({
      HostConfig: { NanoCpus: 2000000000, Memory: 536870912 },
    });
    limiter.setStoragePath(dir);
    await limiter.applyLimit(makeLimit());

    const reloaded = new ResourceLimiter(mockContainerService);
    reloaded.setStoragePath(dir);
    vi.mocked(mockContainerService.inspectContainer).mockClear();
    await reloaded.load();
    mockExec.mockClear();

    await reloaded.removeLimit('container-1');

    expect(mockContainerService.inspectContainer).not.toHaveBeenCalled();
    expect(mockExec).toHaveBeenCalledWith(
      'podman',
      expect.arrayContaining(['update', 'container-1', '--cpus', '2.00', '--memory', '512m']),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should not reload a limit that was removed before the reload', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-resource-'));
  try {
    limiter.setStoragePath(dir);
    await limiter.applyLimit(makeLimit());
    await limiter.removeLimit('container-1');

    const reloaded = new ResourceLimiter(mockContainerService);
    reloaded.setStoragePath(dir);
    await reloaded.load();

    expect(Object.keys(reloaded.getActiveLimits())).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should start fresh if no persisted file exists', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-resource-'));
  try {
    limiter.setStoragePath(dir);
    await expect(limiter.load()).resolves.not.toThrow();
    expect(Object.keys(limiter.getActiveLimits())).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should skip malformed persisted entries without crashing, keeping the valid ones', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-resource-'));
  try {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const valid = { limit: makeLimit({ containerId: 'container-valid' }), original: { cpus: '0', memory: '0' } };
    const malformed = { limit: makeLimit({ containerId: 'container-bad' }) }; // no original field
    writeFileSync(join(dir, 'resource-limits.json'), JSON.stringify([valid, malformed]), 'utf8');

    limiter.setStoragePath(dir);
    await limiter.load();

    expect(Object.keys(limiter.getActiveLimits())).toEqual(['container-valid']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('resource-limits.json'));

    warnSpy.mockRestore();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
