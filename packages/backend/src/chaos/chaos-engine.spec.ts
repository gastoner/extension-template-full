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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as podmanDesktopApi from '@podman-desktop/api';
import { ChaosEngine } from './chaos-engine';
import type { ContainerService } from '../container-service';

const mockContainerService = {
  listContainers: vi.fn(),
  getStats: vi.fn(),
  getAllStats: vi.fn(),
  stopContainer: vi.fn(),
  startContainer: vi.fn(),
  restartContainer: vi.fn(),
  pauseContainer: vi.fn(),
  unpauseContainer: vi.fn(),
  getContainerNetworks: vi.fn(),
  disconnectFromNetwork: vi.fn(),
  connectToNetwork: vi.fn(),
  inspectContainer: vi.fn(),
  checkToolAvailability: vi.fn(),
  invalidateCache: vi.fn(),
} as unknown as ContainerService;

const secretStore = new Map<string, string>();
const mockSecretStorage = {
  get: vi.fn(),
  store: vi.fn(),
  delete: vi.fn(),
  onDidChange: vi.fn(),
} as unknown as podmanDesktopApi.SecretStorage;

let engine: ChaosEngine;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(mockContainerService.listContainers).mockResolvedValue([]);
  vi.mocked(mockContainerService.getStats).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.getAllStats).mockResolvedValue([]);
  vi.mocked(mockContainerService.stopContainer).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.startContainer).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.restartContainer).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.pauseContainer).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.unpauseContainer).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.getContainerNetworks).mockResolvedValue([]);
  vi.mocked(mockContainerService.disconnectFromNetwork).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.connectToNetwork).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.inspectContainer).mockResolvedValue({});
  vi.mocked(mockContainerService.checkToolAvailability).mockResolvedValue(true);

  secretStore.clear();
  vi.mocked(mockSecretStorage.get).mockImplementation((key: string) => Promise.resolve(secretStore.get(key)));
  vi.mocked(mockSecretStorage.store).mockImplementation((key: string, value: string) => {
    secretStore.set(key, value);
    return Promise.resolve();
  });
  vi.mocked(mockSecretStorage.delete).mockImplementation((key: string) => {
    secretStore.delete(key);
    return Promise.resolve();
  });

  engine = new ChaosEngine(mockContainerService);
});

test('should return initial state with no attacks', () => {
  const state = engine.getState();
  expect(state.runningAttacks).toBe(0);
  expect(state.scenarios).toHaveLength(0);
  expect(Object.keys(state.networkRules)).toHaveLength(0);
  expect(Object.keys(state.resourceLimits)).toHaveLength(0);
  expect(Object.keys(state.isolations)).toHaveLength(0);
});

test('should stop all and rollback', async () => {
  await engine.stopAll();
  expect(mockContainerService.invalidateCache).toHaveBeenCalled();
});

test('should set safe patterns on sub-services', () => {
  engine.setSafePatterns(['postgres*', 'redis-*']);
  // No error means success; patterns are compiled internally
});

test('should add and list scenarios', () => {
  engine.scheduler.addScenario({
    id: 'test-1',
    name: 'Test Scenario',
    intervalSec: 30,
    targetStrategy: 'random',
    steps: [{ attackType: 'stop' }],
    enabled: false,
  });

  const scenarios = engine.scheduler.listScenarios();
  expect(scenarios).toHaveLength(1);
  expect(scenarios[0].name).toBe('Test Scenario');
});

test('should count running attacks in state', () => {
  engine.scheduler.addScenario({
    id: 'test-1',
    name: 'Enabled Scenario',
    intervalSec: 30,
    targetStrategy: 'random',
    steps: [{ attackType: 'stop' }],
    enabled: true,
  });

  const state = engine.getState();
  expect(state.runningAttacks).toBe(1);
});

test('should dispose all sub-services', () => {
  engine.scheduler.addScenario({
    id: 'test-1',
    name: 'Scenario',
    intervalSec: 10,
    targetStrategy: 'random',
    steps: [{ attackType: 'stop' }],
    enabled: true,
  });

  engine.dispose();
  expect(engine.scheduler.listScenarios()).toHaveLength(0);
});

test('should persist and reload state across a new engine instance via setStoragePath/loadPersistedState', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-engine-'));
  try {
    engine.setStoragePath(dir);
    await engine.networkShaper.applyRule({ containerId: 'container-1', latencyMs: 100 });

    const reloadedEngine = new ChaosEngine(mockContainerService);
    reloadedEngine.setStoragePath(dir);
    await reloadedEngine.loadPersistedState();

    const state = reloadedEngine.getState();
    expect(state.networkRules['container-1']).toBeDefined();
    expect(state.runningAttacks).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('should forward secret storage to the config saboteur', async () => {
  engine.setSecretStorage(mockSecretStorage);

  await engine.configSaboteur.corrupt('container-1', 'dns-blackhole');

  expect(mockSecretStorage.store).toHaveBeenCalledWith('config-sabotage.container-1', expect.any(String));
});

test('onStateChanged: should notify listeners when an attack is applied via any subsystem', async () => {
  const listener = vi.fn();
  engine.onStateChanged(listener);

  await engine.networkShaper.applyRule({ containerId: 'container-1', latencyMs: 100 });

  expect(listener).toHaveBeenCalled();
});

test('onStateChanged: should notify listeners when the kill count is incremented', () => {
  const listener = vi.fn();
  engine.onStateChanged(listener);

  engine.incrementKillCount();

  expect(listener).toHaveBeenCalledTimes(1);
});

test('onStateChanged: should notify listeners when a scenario is added, toggled, or removed', async () => {
  const listener = vi.fn();
  engine.onStateChanged(listener);

  engine.scheduler.addScenario({
    id: 'test-1',
    name: 'Test Scenario',
    intervalSec: 30,
    targetStrategy: 'random',
    steps: [{ attackType: 'stop' }],
    enabled: false,
  });
  expect(listener).toHaveBeenCalledTimes(1);

  await engine.scheduler.toggleScenario('test-1', true);
  expect(listener).toHaveBeenCalledTimes(2);

  engine.scheduler.removeScenario('test-1');
  expect(listener).toHaveBeenCalledTimes(3);
});

test('onStateChanged: dispose should stop notifying previously registered listeners', () => {
  const listener = vi.fn();
  engine.onStateChanged(listener);

  engine.dispose();
  engine.incrementKillCount();

  expect(listener).not.toHaveBeenCalled();
});
