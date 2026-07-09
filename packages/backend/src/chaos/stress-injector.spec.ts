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
import { StressInjector } from './stress-injector';
import type { ContainerService } from '../container-service';
import type { AffectedRegistry } from './affected-registry';
import type { StressType } from '/@shared/src/ChaosApi';

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

let injector: StressInjector;

beforeEach(() => {
  vi.resetAllMocks();
  mockExec.mockResolvedValue({ stdout: '', stderr: '', command: '' });
  vi.mocked(mockContainerService.listContainers).mockResolvedValue([
    { id: 'container-1', name: 'web-app', state: 'running', engineId: 'engine1' },
    { id: 'container-2', name: 'redis-cache', state: 'running', engineId: 'engine1' },
  ] as Awaited<ReturnType<ContainerService['listContainers']>>);
  vi.mocked(mockContainerService.inspectContainer).mockResolvedValue({ HostConfig: { Memory: 0 } });
  vi.mocked(mockRegistry.markAffected).mockResolvedValue(undefined);
  vi.mocked(mockRegistry.removeAttack).mockResolvedValue(undefined);

  injector = new StressInjector(mockContainerService);
  injector.setRegistry(mockRegistry);
});

test('inject: should mark the container as affected once the injection is tracked', async () => {
  await injector.inject('container-1', 'cpu', 1);

  expect(mockRegistry.markAffected).toHaveBeenCalledTimes(1);
  expect(mockRegistry.markAffected).toHaveBeenCalledWith('container-1', 'stress-cpu');
});

test.each([1, 2, 4, 8])('inject: cpu should spawn %i worker(s) as detached exec calls', async workers => {
  await injector.inject('container-1', 'cpu', workers);

  const detachedCalls = mockExec.mock.calls.filter(
    (call: unknown[]) => Array.isArray(call[1]) && (call[1] as string[]).includes('-d'),
  );
  expect(detachedCalls).toHaveLength(workers);
});

test('inject: cpu should include CHAOS_LAB_STRESS marker and busy-wait loop', async () => {
  await injector.inject('container-1', 'cpu', 1);

  expect(mockExec).toHaveBeenCalledWith(
    'podman',
    expect.arrayContaining([expect.stringContaining('CHAOS_LAB_STRESS=1')]),
  );
  expect(mockExec).toHaveBeenCalledWith(
    'podman',
    expect.arrayContaining([expect.stringContaining('while true; do :; done')]),
  );
});

test('inject: cpu should default to 1 worker when not specified', async () => {
  await injector.inject('container-1', 'cpu');

  const detachedCalls = mockExec.mock.calls.filter(
    (call: unknown[]) => Array.isArray(call[1]) && (call[1] as string[]).includes('-d'),
  );
  expect(detachedCalls).toHaveLength(1);
});

test.each([64, 128, 512])('inject: memory should write %iMB ballast to /dev/shm', async mb => {
  await injector.inject('container-1', 'memory', 1, mb);

  expect(mockExec).toHaveBeenCalledWith(
    'podman',
    expect.arrayContaining([expect.stringContaining('/dev/shm/chaos_ballast')]),
  );
  expect(mockExec).toHaveBeenCalledWith('podman', expect.arrayContaining([expect.stringContaining(`count=${mb}`)]));
});

test('inject: memory should include sleep infinity to keep the process alive', async () => {
  await injector.inject('container-1', 'memory', 1, 64);

  expect(mockExec).toHaveBeenCalledWith('podman', expect.arrayContaining([expect.stringContaining('sleep infinity')]));
});

test('inject: memory-oom should write to /dev/shm in a loop', async () => {
  await injector.inject('container-1', 'memory-oom');

  expect(mockExec).toHaveBeenCalledWith(
    'podman',
    expect.arrayContaining([expect.stringContaining('/dev/shm/chaos_oom_')]),
  );
  expect(mockExec).toHaveBeenCalledWith('podman', expect.arrayContaining([expect.stringContaining('while true')]));
});

test.each([
  { memoryBytes: 0, expectedChunk: 50, description: 'no limit set' },
  { memoryBytes: 512 * 1024 * 1024, expectedChunk: 51, description: '512MB limit' },
  { memoryBytes: 32 * 1024 * 1024, expectedChunk: 10, description: '32MB limit (enforces minimum 10)' },
])('inject: memory-oom should use $expectedChunkMB chunk when $description', async ({ memoryBytes, expectedChunk }) => {
  vi.mocked(mockContainerService.inspectContainer).mockResolvedValue({
    HostConfig: { Memory: memoryBytes },
  });

  await injector.inject('container-1', 'memory-oom');

  expect(mockExec).toHaveBeenCalledWith(
    'podman',
    expect.arrayContaining([expect.stringContaining(`count=${expectedChunk}`)]),
  );
});

test('inject: log-flood should execute an infinite echo loop with the stress marker', async () => {
  await injector.inject('container-1', 'log-flood');

  expect(mockExec).toHaveBeenCalledWith(
    'podman',
    expect.arrayContaining([expect.stringContaining('CHAOS_LAB_STRESS=1')]),
  );
  expect(mockExec).toHaveBeenCalledWith(
    'podman',
    expect.arrayContaining([expect.stringContaining('while true; do echo')]),
  );
});

test.each([
  { type: 'cpu' as StressType, workers: 2, targetMb: 64 },
  { type: 'memory' as StressType, workers: 1, targetMb: 256 },
  { type: 'log-flood' as StressType, workers: 1, targetMb: 64 },
])('inject: tracking should record $type injection as active', async ({ type, workers, targetMb }) => {
  await injector.inject('container-1', type, workers, targetMb);

  const injections = injector.listInjections();
  expect(injections).toHaveLength(1);
  expect(injections[0].containerId).toBe('container-1');
  expect(injections[0].type).toBe(type);
});

test('inject: tracking should stop existing injection before starting a new one', async () => {
  await injector.inject('container-1', 'cpu', 2);
  mockExec.mockClear();

  await injector.inject('container-1', 'log-flood');

  const firstCall = mockExec.mock.calls[0];
  expect((firstCall[1] as string[]).join(' ')).toContain('kill -9');

  const injections = injector.listInjections();
  expect(injections).toHaveLength(1);
  expect(injections[0].type).toBe('log-flood');
});

test.each([
  { pattern: 'redis*', containerId: 'container-2', containerName: 'redis-cache' },
  { pattern: 'Web*', containerId: 'container-1', containerName: 'web-app' },
])(
  'inject: safe patterns should reject injection when container matches "$pattern"',
  async ({ pattern, containerId }) => {
    injector.setSafePatterns([pattern]);

    await expect(injector.inject(containerId, 'cpu')).rejects.toThrow('is in the safe list');
  },
);

test('inject: safe patterns should allow injection on non-matching containers', async () => {
  injector.setSafePatterns(['postgres*']);

  await expect(injector.inject('container-1', 'cpu')).resolves.not.toThrow();
});

test('stop: should kill processes matching the stress marker', async () => {
  await injector.inject('container-1', 'cpu');
  mockExec.mockClear();

  await injector.stop('container-1');

  expect(mockExec).toHaveBeenCalledWith(
    'podman',
    expect.arrayContaining(['exec', 'container-1', 'sh', '-c', expect.stringContaining('kill -9')]),
  );
});

test('stop: should clean up /dev/shm files', async () => {
  await injector.inject('container-1', 'memory');
  mockExec.mockClear();

  await injector.stop('container-1');

  expect(mockExec).toHaveBeenCalledWith(
    'podman',
    expect.arrayContaining([expect.stringContaining('rm -f /dev/shm/chaos_ballast /dev/shm/chaos_oom_*')]),
  );
});

test('stop: should remove the injection from active list', async () => {
  await injector.inject('container-1', 'cpu');
  await injector.stop('container-1');

  expect(injector.listInjections()).toHaveLength(0);
});

test('stop: should no-op when container has no active injection', async () => {
  await injector.stop('nonexistent');

  expect(mockExec).not.toHaveBeenCalled();
});

test('stop: should handle exec failure gracefully when container is gone', async () => {
  await injector.inject('container-1', 'cpu');
  mockExec.mockRejectedValueOnce(new Error('container not running'));

  await expect(injector.stop('container-1')).resolves.not.toThrow();
  expect(injector.listInjections()).toHaveLength(0);
});

test('rollbackAll: should stop all active injections', async () => {
  await injector.inject('container-1', 'cpu');
  await injector.inject('container-2', 'log-flood');

  await injector.rollbackAll();

  expect(injector.listInjections()).toHaveLength(0);
});

test('rollbackAll: should no-op when no injections are active', async () => {
  mockExec.mockClear();
  await injector.rollbackAll();

  expect(mockExec).not.toHaveBeenCalled();
});

test('dispose: should clear the tracking map without exec calls', async () => {
  await injector.inject('container-1', 'cpu');
  mockExec.mockClear();

  injector.dispose();

  expect(injector.listInjections()).toHaveLength(0);
  expect(mockExec).not.toHaveBeenCalled();
});

test('getActiveInjections: should return record keyed by container ID', async () => {
  await injector.inject('container-1', 'cpu', 3);
  await injector.inject('container-2', 'memory', 1, 256);

  const active = injector.getActiveInjections();
  expect(active['container-1'].type).toBe('cpu');
  expect(active['container-1'].workers).toBe(3);
  expect(active['container-2'].type).toBe('memory');
  expect(active['container-2'].targetMb).toBe(256);
});

test('save/load: should persist active injections to disk and reload them into a new instance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-stress-'));
  try {
    injector.setStoragePath(dir);
    await injector.inject('container-1', 'cpu', 2, 64);

    const reloaded = new StressInjector(mockContainerService);
    reloaded.setStoragePath(dir);
    mockExec.mockClear();
    await reloaded.load();

    expect(mockExec).not.toHaveBeenCalled();
    const injections = reloaded.listInjections();
    expect(injections).toHaveLength(1);
    expect(injections[0]).toEqual(expect.objectContaining({ containerId: 'container-1', type: 'cpu', workers: 2 }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should not reload an injection that was stopped before the reload', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-stress-'));
  try {
    injector.setStoragePath(dir);
    await injector.inject('container-1', 'cpu');
    await injector.stop('container-1');

    const reloaded = new StressInjector(mockContainerService);
    reloaded.setStoragePath(dir);
    await reloaded.load();

    expect(reloaded.listInjections()).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should start fresh if no persisted file exists', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-stress-'));
  try {
    injector.setStoragePath(dir);
    await expect(injector.load()).resolves.not.toThrow();
    expect(injector.listInjections()).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should skip malformed persisted entries without crashing, keeping the valid ones', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-stress-'));
  try {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const valid = { containerId: 'container-valid', containerName: 'web', type: 'cpu', startedAt: Date.now() };
    const malformed = { containerId: 'container-bad', containerName: 'web', type: 'gpu-melt', startedAt: Date.now() };
    writeFileSync(join(dir, 'stress-injections.json'), JSON.stringify([valid, malformed]), 'utf8');

    injector.setStoragePath(dir);
    await injector.load();

    expect(injector.listInjections().map(i => i.containerId)).toEqual(['container-valid']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('stress-injections.json'));

    warnSpy.mockRestore();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
