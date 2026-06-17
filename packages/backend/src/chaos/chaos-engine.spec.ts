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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChaosEngine } from './chaos-engine';
import type { ContainerService } from '../container-service';

function createMockContainerService(): ContainerService {
  return {
    listContainers: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue(undefined),
    getAllStats: vi.fn().mockResolvedValue([]),
    stopContainer: vi.fn().mockResolvedValue(undefined),
    startContainer: vi.fn().mockResolvedValue(undefined),
    restartContainer: vi.fn().mockResolvedValue(undefined),
    pauseContainer: vi.fn().mockResolvedValue(undefined),
    unpauseContainer: vi.fn().mockResolvedValue(undefined),
    getContainerNetworks: vi.fn().mockResolvedValue([]),
    disconnectFromNetwork: vi.fn().mockResolvedValue(undefined),
    connectToNetwork: vi.fn().mockResolvedValue(undefined),
    inspectContainer: vi.fn().mockResolvedValue({}),
    checkToolAvailability: vi.fn().mockResolvedValue(true),
    invalidateCache: vi.fn(),
  } as unknown as ContainerService;
}

describe('ChaosEngine', () => {
  let engine: ChaosEngine;
  let containerService: ContainerService;

  beforeEach(() => {
    vi.resetAllMocks();
    containerService = createMockContainerService();
    engine = new ChaosEngine(containerService);
  });

  it('should return initial state with no attacks', () => {
    const state = engine.getState();
    expect(state.runningAttacks).toBe(0);
    expect(state.scenarios).toHaveLength(0);
    expect(Object.keys(state.networkRules)).toHaveLength(0);
    expect(Object.keys(state.resourceLimits)).toHaveLength(0);
    expect(Object.keys(state.isolations)).toHaveLength(0);
  });

  it('should stop all and rollback', async () => {
    await engine.stopAll();
    expect(containerService.invalidateCache).toHaveBeenCalled();
  });

  it('should set safe patterns on sub-services', () => {
    engine.setSafePatterns(['postgres*', 'redis-*']);
    // No error means success; patterns are compiled internally
  });

  it('should add and list scenarios', () => {
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

  it('should count running attacks in state', () => {
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

  it('should dispose all sub-services', () => {
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
});
