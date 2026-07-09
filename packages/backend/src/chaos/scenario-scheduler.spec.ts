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
import { ScenarioScheduler } from './scenario-scheduler';
import type { ContainerService } from '../container-service';
import type { NetworkShaper } from './network-shaper';
import type { ResourceLimiter } from './resource-limiter';
import type { ChaosEngine } from './chaos-engine';
import type { Scenario } from '/@shared/src/ChaosApi';

const mockContainerService = {
  listContainers: vi.fn(),
  pauseContainer: vi.fn(),
  unpauseContainer: vi.fn(),
  startContainer: vi.fn(),
} as unknown as ContainerService;

const mockNetworkShaper = {
  applyRule: vi.fn(),
  removeRule: vi.fn(),
} as unknown as NetworkShaper;

const mockResourceLimiter = {
  removeLimit: vi.fn(),
} as unknown as ResourceLimiter;

const mockEngine = {
  notifyStateChanged: vi.fn(),
  incrementKillCount: vi.fn(),
} as unknown as ChaosEngine;

let scheduler: ScenarioScheduler;

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'scenario-1',
    name: 'Test Scenario',
    intervalSec: 30,
    targetStrategy: 'random',
    steps: [{ attackType: 'stop' }],
    enabled: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(mockContainerService.listContainers).mockResolvedValue([]);
  vi.mocked(mockContainerService.pauseContainer).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.unpauseContainer).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.startContainer).mockResolvedValue(undefined);
  vi.mocked(mockNetworkShaper.applyRule).mockResolvedValue(undefined);
  vi.mocked(mockNetworkShaper.removeRule).mockResolvedValue(undefined);
  vi.mocked(mockResourceLimiter.removeLimit).mockResolvedValue(undefined);

  scheduler = new ScenarioScheduler(mockContainerService, mockNetworkShaper, mockResourceLimiter, mockEngine);
});

test('save/load: should persist scenarios to disk and reload them into a new instance', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-scenarios-'));
  try {
    scheduler.setStoragePath(dir);
    scheduler.addScenario(makeScenario({ id: 'scenario-1', name: 'Persisted', intervalSec: 45 }));
    await scheduler.save();

    const reloaded = new ScenarioScheduler(mockContainerService, mockNetworkShaper, mockResourceLimiter, mockEngine);
    reloaded.setStoragePath(dir);
    await reloaded.load();

    const scenarios = reloaded.listScenarios();
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]).toMatchObject({ id: 'scenario-1', name: 'Persisted', intervalSec: 45 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should always reload scenarios as disabled regardless of their persisted enabled state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-scenarios-'));
  try {
    scheduler.setStoragePath(dir);
    scheduler.addScenario(makeScenario({ enabled: true }));
    await scheduler.save();

    const reloaded = new ScenarioScheduler(mockContainerService, mockNetworkShaper, mockResourceLimiter, mockEngine);
    reloaded.setStoragePath(dir);
    await reloaded.load();

    expect(reloaded.listScenarios()[0].enabled).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should skip malformed persisted entries without crashing, keeping the valid ones', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-scenarios-'));
  try {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const validScenario = makeScenario({ id: 'scenario-valid' });
    const malformedScenario = { id: 'scenario-bad', name: 'Bad', steps: [{ attackType: 'nuke' }] };
    writeFileSync(join(dir, 'scenarios.json'), JSON.stringify([validScenario, malformedScenario]), 'utf8');

    scheduler.setStoragePath(dir);
    await scheduler.load();

    const scenarios = scheduler.listScenarios();
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].id).toBe('scenario-valid');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('scenarios.json'));

    warnSpy.mockRestore();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getStoragePath: should return undefined until setStoragePath is called, then the configured path', () => {
  expect(scheduler.getStoragePath()).toBeUndefined();

  scheduler.setStoragePath('/tmp/chaos-storage');

  expect(scheduler.getStoragePath()).toBe('/tmp/chaos-storage');
});

test('save/load: should start fresh if no persisted file exists', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-scenarios-'));
  try {
    scheduler.setStoragePath(dir);
    await expect(scheduler.load()).resolves.not.toThrow();
    expect(scheduler.listScenarios()).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('toggleScenario: should mark the scenario enabled without reverting anything when starting it', async () => {
  scheduler.addScenario(makeScenario({ enabled: false }));

  await scheduler.toggleScenario('scenario-1', true);

  expect(scheduler.listScenarios()[0].enabled).toBe(true);
  expect(mockContainerService.unpauseContainer).not.toHaveBeenCalled();
});

test('toggleScenario: should revert every attack the scenario has caused so far when stopping it', async () => {
  vi.mocked(mockContainerService.listContainers).mockResolvedValue([
    { id: 'c1', engineId: 'e1', name: 'web', state: 'running' },
  ] as Awaited<ReturnType<ContainerService['listContainers']>>);

  scheduler.addScenario(
    makeScenario({
      targetStrategy: 'all',
      steps: [{ attackType: 'pause' }, { attackType: 'network-shape', latencyMs: 100 }],
    }),
  );
  await scheduler.runOnce('scenario-1');
  expect(mockContainerService.pauseContainer).toHaveBeenCalledWith('c1');
  expect(mockNetworkShaper.applyRule).toHaveBeenCalled();

  await scheduler.toggleScenario('scenario-1', false);

  expect(mockContainerService.unpauseContainer).toHaveBeenCalledWith('c1');
  expect(mockNetworkShaper.removeRule).toHaveBeenCalledWith('c1');
  expect(scheduler.listScenarios()[0].enabled).toBe(false);
});

test('toggleScenario: should clear tracked attacks after stopping so a second stop does not revert them again', async () => {
  vi.mocked(mockContainerService.listContainers).mockResolvedValue([
    { id: 'c1', engineId: 'e1', name: 'web', state: 'running' },
  ] as Awaited<ReturnType<ContainerService['listContainers']>>);

  scheduler.addScenario(makeScenario({ targetStrategy: 'all', steps: [{ attackType: 'pause' }] }));
  await scheduler.runOnce('scenario-1');

  await scheduler.toggleScenario('scenario-1', false);
  await scheduler.toggleScenario('scenario-1', false);

  expect(mockContainerService.unpauseContainer).toHaveBeenCalledTimes(1);
});

test('toggleScenario: should no-op gracefully for an unknown scenario id', async () => {
  await expect(scheduler.toggleScenario('nonexistent', false)).resolves.not.toThrow();
});
