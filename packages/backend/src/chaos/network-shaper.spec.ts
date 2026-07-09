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
import { NetworkShaper } from './network-shaper';
import type { ContainerService } from '../container-service';
import type { AffectedRegistry } from './affected-registry';
import type { NetworkRule } from '/@shared/src/ChaosApi';

const mockExec = vi.mocked(process.exec);

const mockContainerService = {
  listContainers: vi.fn(),
  checkToolAvailability: vi.fn(),
  inspectContainer: vi.fn(),
  invalidateCache: vi.fn(),
} as unknown as ContainerService;

const mockRegistry = {
  markAffected: vi.fn(),
  removeAttack: vi.fn(),
} as unknown as AffectedRegistry;

let shaper: NetworkShaper;

function makeRule(overrides: Partial<NetworkRule> = {}): NetworkRule {
  return {
    containerId: 'container-1',
    latencyMs: 100,
    packetLossPercent: 5,
    bandwidthKbps: 1000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockExec.mockResolvedValue({ stdout: '', stderr: '', command: '' });
  vi.mocked(mockContainerService.listContainers).mockResolvedValue([
    { id: 'container-1', name: 'web-app', state: 'running', engineId: 'e1' },
    { id: 'container-2', name: 'redis-cache', state: 'running', engineId: 'e1' },
  ] as Awaited<ReturnType<ContainerService['listContainers']>>);
  vi.mocked(mockContainerService.checkToolAvailability).mockResolvedValue(true);
  vi.mocked(mockContainerService.inspectContainer).mockResolvedValue({});
  vi.mocked(mockRegistry.markAffected).mockResolvedValue(undefined);
  vi.mocked(mockRegistry.removeAttack).mockResolvedValue(undefined);

  shaper = new NetworkShaper(mockContainerService);
  shaper.setRegistry(mockRegistry);
});

test('applyRule: should clear existing qdisc before applying new rule', async () => {
  await shaper.applyRule(makeRule());

  const firstTcCall = mockExec.mock.calls[0];
  expect((firstTcCall[1] as string[]).join(' ')).toContain('qdisc del dev eth0 root');
});

test.each([
  { param: 'latencyMs', value: 200, expected: 'delay 200ms' },
  { param: 'packetLossPercent', value: 10, expected: 'loss 10%' },
  { param: 'bandwidthKbps', value: 500, expected: 'rate 500kbit' },
])('applyRule: should apply tc netem with $param=$value', async ({ param, value, expected }) => {
  await shaper.applyRule(makeRule({ [param]: value }));

  const tcAddCall = mockExec.mock.calls.find((call: unknown[]) =>
    (call[1] as string[]).join(' ').includes('qdisc add'),
  );
  const cmd = (tcAddCall![1] as string[]).find((a: string) => a.includes('tc'))!;
  expect(cmd).toContain(expected);
});

test.each([
  { param: 'latencyMs', zeroed: 'delay' },
  { param: 'bandwidthKbps', zeroed: 'rate' },
])('applyRule: should omit $zeroed when $param is 0', async ({ param, zeroed }) => {
  await shaper.applyRule(makeRule({ [param]: 0 }));

  const tcAddCall = mockExec.mock.calls.find((call: unknown[]) =>
    (call[1] as string[]).join(' ').includes('qdisc add'),
  );
  const cmd = (tcAddCall![1] as string[]).find((a: string) => a.includes('tc'))!;
  expect(cmd).not.toContain(zeroed);
});

test('applyRule: should throw if tc is not available in the container', async () => {
  vi.mocked(mockContainerService.checkToolAvailability).mockResolvedValue(false);

  await expect(shaper.applyRule(makeRule())).rejects.toThrow(`does not have 'tc'`);
});

test('applyRule: should mark the container as affected only after the rule is successfully applied', async () => {
  await shaper.applyRule(makeRule());

  expect(mockRegistry.markAffected).toHaveBeenCalledTimes(1);
  expect(mockRegistry.markAffected).toHaveBeenCalledWith('container-1', 'network-shape');
});

test('applyRule: should not mark the container as affected if tc is unavailable', async () => {
  vi.mocked(mockContainerService.checkToolAvailability).mockResolvedValue(false);

  await expect(shaper.applyRule(makeRule())).rejects.toThrow();

  expect(mockRegistry.markAffected).not.toHaveBeenCalled();
});

test('applyRule: should not mark the container as affected if the tc exec fails', async () => {
  // The qdisc-del cleanup call is caught internally; the qdisc-add call is not, so it's the
  // one that ultimately fails the operation regardless of ordering.
  mockExec.mockRejectedValue(new Error('tc exec failed'));

  await expect(shaper.applyRule(makeRule())).rejects.toThrow('tc exec failed');

  expect(mockRegistry.markAffected).not.toHaveBeenCalled();
});

test('applyRule: should track the rule as active', async () => {
  await shaper.applyRule(makeRule());

  const active = shaper.getActiveRules();
  expect(active['container-1']).toBeDefined();
  expect(active['container-1'].latencyMs).toBe(100);
});

test('applyRule: should reject safe-listed containers', async () => {
  shaper.setSafePatterns(['web*']);

  await expect(shaper.applyRule(makeRule())).rejects.toThrow('is in the safe list');
});

test('applyRule: DNS blocking should add entries to /etc/hosts for each blocked host', async () => {
  await shaper.applyRule(makeRule({ dnsBlock: ['evil.com', 'spam.net'] }));

  const dnsExecCalls = mockExec.mock.calls.filter((call: unknown[]) =>
    (call[1] as string[]).join(' ').includes('/etc/hosts'),
  );
  expect(dnsExecCalls).toHaveLength(2);
  expect((dnsExecCalls[0][1] as string[]).join(' ')).toContain('127.0.0.1 evil.com');
  expect((dnsExecCalls[1][1] as string[]).join(' ')).toContain('127.0.0.1 spam.net');
});

test('removeRule: should remove tc qdisc from the container', async () => {
  await shaper.applyRule(makeRule());
  mockExec.mockClear();

  await shaper.removeRule('container-1');

  const delCall = mockExec.mock.calls.find((call: unknown[]) => (call[1] as string[]).join(' ').includes('qdisc del'));
  expect(delCall).toBeDefined();
});

test('removeRule: should remove DNS blocks from /etc/hosts', async () => {
  await shaper.applyRule(makeRule({ dnsBlock: ['evil.com'] }));
  mockExec.mockClear();

  await shaper.removeRule('container-1');

  const sedCall = mockExec.mock.calls.find((call: unknown[]) => (call[1] as string[]).join(' ').includes('sed'));
  expect(sedCall).toBeDefined();
  expect((sedCall![1] as string[]).join(' ')).toContain('evil.com');
});

test('removeRule: should no-op if no rule is active for the container', async () => {
  mockExec.mockClear();
  await shaper.removeRule('nonexistent');

  expect(mockExec).not.toHaveBeenCalled();
});

test('removeRule: should clear the active rule entry', async () => {
  await shaper.applyRule(makeRule());
  await shaper.removeRule('container-1');

  expect(shaper.getActiveRules()['container-1']).toBeUndefined();
});

test('rollbackAll: should remove all active rules', async () => {
  await shaper.applyRule(makeRule({ containerId: 'container-1' }));
  await shaper.applyRule(makeRule({ containerId: 'container-2' }));

  await shaper.rollbackAll();

  expect(Object.keys(shaper.getActiveRules())).toHaveLength(0);
});

test('dispose: should clear tracking without exec calls', async () => {
  await shaper.applyRule(makeRule());
  mockExec.mockClear();

  shaper.dispose();

  expect(Object.keys(shaper.getActiveRules())).toHaveLength(0);
  expect(mockExec).not.toHaveBeenCalled();
});

test('save/load: should persist active rules to disk and reload them into a new instance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-network-'));
  try {
    shaper.setStoragePath(dir);
    await shaper.applyRule(makeRule({ containerId: 'container-1', latencyMs: 250 }));

    const reloaded = new NetworkShaper(mockContainerService);
    reloaded.setStoragePath(dir);
    mockExec.mockClear();
    await reloaded.load();

    expect(mockExec).not.toHaveBeenCalled();
    expect(reloaded.getActiveRules()['container-1']).toEqual(expect.objectContaining({ latencyMs: 250 }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should not reload a rule that was removed before the reload', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-network-'));
  try {
    shaper.setStoragePath(dir);
    await shaper.applyRule(makeRule());
    await shaper.removeRule('container-1');

    const reloaded = new NetworkShaper(mockContainerService);
    reloaded.setStoragePath(dir);
    await reloaded.load();

    expect(Object.keys(reloaded.getActiveRules())).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should start fresh if no persisted file exists', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-network-'));
  try {
    shaper.setStoragePath(dir);
    await expect(shaper.load()).resolves.not.toThrow();
    expect(Object.keys(shaper.getActiveRules())).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should skip malformed persisted entries without crashing, keeping the valid ones', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-network-'));
  try {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const valid = makeRule({ containerId: 'container-valid' });
    const malformed = { containerId: 'container-bad', latencyMs: 'not-a-number' };
    writeFileSync(join(dir, 'network-rules.json'), JSON.stringify([valid, malformed]), 'utf8');

    shaper.setStoragePath(dir);
    await shaper.load();

    expect(Object.keys(shaper.getActiveRules())).toEqual(['container-valid']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('network-rules.json'));

    warnSpy.mockRestore();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
