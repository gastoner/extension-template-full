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

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { process } from '@podman-desktop/api';
import { ContainerIsolator } from './container-isolator';
import type { ContainerService } from '../container-service';
import type { AffectedRegistry } from './affected-registry';
import type { IsolationRule } from '/@shared/src/ChaosApi';

const mockExec = vi.mocked(process.exec);

const mockContainerService = {
  listContainers: vi.fn(),
  pauseContainer: vi.fn(),
  unpauseContainer: vi.fn(),
  getContainerNetworks: vi.fn(),
  disconnectFromNetwork: vi.fn(),
  connectToNetwork: vi.fn(),
  checkToolAvailability: vi.fn(),
  inspectContainer: vi.fn(),
  invalidateCache: vi.fn(),
} as unknown as ContainerService;

const mockRegistry = {
  markAffected: vi.fn(),
  removeAttack: vi.fn(),
} as unknown as AffectedRegistry;

let isolator: ContainerIsolator;

function makeRule(overrides: Partial<IsolationRule> = {}): IsolationRule {
  return {
    containerId: 'container-1',
    containerName: 'web-app',
    mode: 'pause',
    startedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockExec.mockResolvedValue({ stdout: '10.88.0.5', stderr: '', command: '' });
  vi.mocked(mockContainerService.listContainers).mockResolvedValue([
    { id: 'container-1', name: 'web-app', state: 'running', engineId: 'e1' },
    { id: 'container-2', name: 'redis-cache', state: 'running', engineId: 'e1' },
  ] as Awaited<ReturnType<ContainerService['listContainers']>>);
  vi.mocked(mockContainerService.pauseContainer).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.unpauseContainer).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.getContainerNetworks).mockResolvedValue(['bridge', 'app-net']);
  vi.mocked(mockContainerService.disconnectFromNetwork).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.connectToNetwork).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.checkToolAvailability).mockResolvedValue(true);
  vi.mocked(mockContainerService.inspectContainer).mockResolvedValue({});
  vi.mocked(mockRegistry.markAffected).mockResolvedValue(undefined);
  vi.mocked(mockRegistry.removeAttack).mockResolvedValue(undefined);

  isolator = new ContainerIsolator(mockContainerService);
  isolator.setRegistry(mockRegistry);
});

afterEach(() => {
  isolator.dispose();
  vi.useRealTimers();
});

test('isolate: pause mode should call pauseContainer and track the isolation', async () => {
  await isolator.isolate(makeRule({ mode: 'pause' }));

  expect(mockContainerService.pauseContainer).toHaveBeenCalledWith('container-1');
  expect(isolator.listIsolations()).toHaveLength(1);
  expect(isolator.listIsolations()[0].mode).toBe('pause');
});

test('isolate: network-disconnect mode should disconnect from specified networks', async () => {
  await isolator.isolate(
    makeRule({
      mode: 'network-disconnect',
      disconnectedNetworks: ['bridge'],
    }),
  );

  expect(mockContainerService.disconnectFromNetwork).toHaveBeenCalledWith('container-1', 'bridge');
});

test('isolate: network-disconnect mode should auto-detect networks if none specified', async () => {
  await isolator.isolate(makeRule({ mode: 'network-disconnect' }));

  expect(mockContainerService.getContainerNetworks).toHaveBeenCalledWith('container-1');
  expect(mockContainerService.disconnectFromNetwork).toHaveBeenCalledTimes(2);
});

test('isolate: network-partition mode should add iptables DROP rules for peer IPs', async () => {
  await isolator.isolate(
    makeRule({
      mode: 'network-partition',
      partitionPeers: ['container-2'],
    }),
  );

  const iptablesCalls = mockExec.mock.calls.filter((call: unknown[]) =>
    (call[1] as string[]).join(' ').includes('iptables'),
  );
  const cmds = iptablesCalls.map((c: unknown[]) => (c[1] as string[]).join(' '));
  expect(cmds.some((c: string) => c.includes('-A OUTPUT') && c.includes('DROP'))).toBe(true);
  expect(cmds.some((c: string) => c.includes('-A INPUT') && c.includes('DROP'))).toBe(true);
});

test.each([{ peers: [], error: 'at least one peer' }])(
  'isolate: network-partition mode should throw when partitionPeers is empty',
  async ({ peers, error }) => {
    await expect(isolator.isolate(makeRule({ mode: 'network-partition', partitionPeers: peers }))).rejects.toThrow(
      error,
    );
  },
);

test('isolate: network-partition mode should throw if iptables not available in container', async () => {
  vi.mocked(mockContainerService.checkToolAvailability).mockResolvedValue(false);

  await expect(
    isolator.isolate(makeRule({ mode: 'network-partition', partitionPeers: ['container-2'] })),
  ).rejects.toThrow('does not have iptables');
});

test('isolate: should mark the container as affected only after isolation is successfully applied', async () => {
  await isolator.isolate(makeRule({ mode: 'pause' }));

  expect(mockRegistry.markAffected).toHaveBeenCalledTimes(1);
  expect(mockRegistry.markAffected).toHaveBeenCalledWith('container-1', 'isolation-pause');
});

test('isolate: should not mark the container as affected if iptables is unavailable', async () => {
  vi.mocked(mockContainerService.checkToolAvailability).mockResolvedValue(false);

  await expect(
    isolator.isolate(makeRule({ mode: 'network-partition', partitionPeers: ['container-2'] })),
  ).rejects.toThrow();

  expect(mockRegistry.markAffected).not.toHaveBeenCalled();
});

test('isolate: should not mark the container as affected if pauseContainer fails', async () => {
  vi.mocked(mockContainerService.pauseContainer).mockRejectedValueOnce(new Error('pause failed'));

  await expect(isolator.isolate(makeRule({ mode: 'pause' }))).rejects.toThrow('pause failed');

  expect(mockRegistry.markAffected).not.toHaveBeenCalled();
});

test.each([
  { pattern: 'web*', containerName: 'web-app' },
  { pattern: 'Web*', containerName: 'web-app' },
])('isolate: safe patterns should reject isolation when container matches "$pattern"', async ({ pattern }) => {
  isolator.setSafePatterns([pattern]);

  await expect(isolator.isolate(makeRule())).rejects.toThrow('is in the safe list');
});

test('isolate: auto-restore should automatically restore after specified seconds', async () => {
  await isolator.isolate(makeRule({ mode: 'pause', autoRestoreAfterSec: 30 }));
  expect(isolator.listIsolations()).toHaveLength(1);

  vi.advanceTimersByTime(30_000);
  await vi.runAllTimersAsync();

  expect(mockContainerService.unpauseContainer).toHaveBeenCalledWith('container-1');
});

test('isolate: auto-restore should cancel timer when manually restored', async () => {
  await isolator.isolate(makeRule({ mode: 'pause', autoRestoreAfterSec: 60 }));
  await isolator.restore('container-1');

  vi.advanceTimersByTime(60_000);

  expect(mockContainerService.unpauseContainer).toHaveBeenCalledTimes(1);
});

test.each([{ mode: 'pause' as const, expectCall: 'unpauseContainer' as const }])(
  'restore: should unpause for $mode mode',
  async ({ mode, expectCall }) => {
    await isolator.isolate(makeRule({ mode }));
    await isolator.restore('container-1');

    expect(mockContainerService[expectCall]).toHaveBeenCalledWith('container-1');
    expect(isolator.listIsolations()).toHaveLength(0);
  },
);

test('restore: should reconnect disconnected networks', async () => {
  await isolator.isolate(makeRule({ mode: 'network-disconnect', disconnectedNetworks: ['bridge'] }));
  await isolator.restore('container-1');

  expect(mockContainerService.connectToNetwork).toHaveBeenCalledWith('container-1', 'bridge');
});

test('restore: should remove iptables rules for network-partition', async () => {
  await isolator.isolate(makeRule({ mode: 'network-partition', partitionPeers: ['container-2'] }));
  mockExec.mockClear();

  await isolator.restore('container-1');

  const iptablesCalls = mockExec.mock.calls.filter((call: unknown[]) =>
    (call[1] as string[]).join(' ').includes('iptables'),
  );
  const cmds = iptablesCalls.map((c: unknown[]) => (c[1] as string[]).join(' '));
  expect(cmds.some((c: string) => c.includes('-D OUTPUT'))).toBe(true);
  expect(cmds.some((c: string) => c.includes('-D INPUT'))).toBe(true);
});

test('restore: should no-op if container is not isolated', async () => {
  await isolator.restore('nonexistent');

  expect(mockContainerService.unpauseContainer).not.toHaveBeenCalled();
});

test('rollbackAll: should restore all isolated containers', async () => {
  await isolator.isolate(makeRule({ containerId: 'container-1', containerName: 'web-app', mode: 'pause' }));
  await isolator.isolate(makeRule({ containerId: 'container-2', containerName: 'redis-cache', mode: 'pause' }));

  await isolator.rollbackAll();

  expect(isolator.listIsolations()).toHaveLength(0);
});

test('dispose: should clear timers and tracking', async () => {
  await isolator.isolate(makeRule({ mode: 'pause', autoRestoreAfterSec: 60 }));
  isolator.dispose();

  expect(isolator.listIsolations()).toHaveLength(0);
});

test('save/load: should persist isolations to disk and reload them into a new instance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-isolator-'));
  try {
    isolator.setStoragePath(dir);
    await isolator.isolate(makeRule({ mode: 'pause' }));

    const reloaded = new ContainerIsolator(mockContainerService);
    reloaded.setStoragePath(dir);
    await reloaded.load();

    expect(reloaded.listIsolations()).toHaveLength(1);
    expect(reloaded.listIsolations()[0].mode).toBe('pause');
    reloaded.dispose();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should immediately restore an isolation whose auto-restore deadline already passed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-isolator-'));
  try {
    const staleRule = makeRule({ mode: 'pause', autoRestoreAfterSec: 30, startedAt: Date.now() - 40_000 });
    writeFileSync(join(dir, 'isolations.json'), JSON.stringify([staleRule]), 'utf8');

    const reloaded = new ContainerIsolator(mockContainerService);
    reloaded.setStoragePath(dir);
    await reloaded.load();

    expect(mockContainerService.unpauseContainer).toHaveBeenCalledWith('container-1');
    expect(reloaded.listIsolations()).toHaveLength(0);
    reloaded.dispose();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should reschedule the remaining auto-restore time for a not-yet-elapsed isolation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-isolator-'));
  try {
    const freshRule = makeRule({ mode: 'pause', autoRestoreAfterSec: 30, startedAt: Date.now() - 5_000 });
    writeFileSync(join(dir, 'isolations.json'), JSON.stringify([freshRule]), 'utf8');

    const reloaded = new ContainerIsolator(mockContainerService);
    reloaded.setStoragePath(dir);
    await reloaded.load();

    expect(reloaded.listIsolations()).toHaveLength(1);
    expect(mockContainerService.unpauseContainer).not.toHaveBeenCalled();

    vi.advanceTimersByTime(25_000);
    await vi.runAllTimersAsync();

    expect(mockContainerService.unpauseContainer).toHaveBeenCalledWith('container-1');
    reloaded.dispose();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should start fresh if no persisted file exists', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-isolator-'));
  try {
    isolator.setStoragePath(dir);
    await expect(isolator.load()).resolves.not.toThrow();
    expect(isolator.listIsolations()).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should skip malformed persisted entries without crashing, keeping the valid ones', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-isolator-'));
  try {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const valid = makeRule({ containerId: 'container-valid' });
    const malformed = makeRule({ containerId: 'container-bad', mode: 'teleport' as IsolationRule['mode'] });
    writeFileSync(join(dir, 'isolations.json'), JSON.stringify([valid, malformed]), 'utf8');

    isolator.setStoragePath(dir);
    await isolator.load();

    expect(isolator.listIsolations().map(r => r.containerId)).toEqual(['container-valid']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('isolations.json'));

    warnSpy.mockRestore();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
