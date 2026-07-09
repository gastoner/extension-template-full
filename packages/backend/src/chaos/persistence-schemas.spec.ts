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
import {
  AffectedContainerStateSchema,
  IsolationRuleSchema,
  NetworkRuleSchema,
  ScenarioSchema,
  StressInjectionSchema,
  parsePersistedArray,
} from './persistence-schemas';

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

test('parsePersistedArray: should return an empty array and warn when the top-level value is not an array', () => {
  const result = parsePersistedArray({ not: 'an array' }, NetworkRuleSchema, 'network-rules.json');

  expect(result).toEqual([]);
  expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('network-rules.json'));
});

test('parsePersistedArray: should keep valid entries and drop invalid ones, warning per dropped entry', () => {
  const raw = [
    { containerId: 'container-1', latencyMs: 100 },
    { containerId: 42 }, // containerId should be a string
    { latencyMs: 100 }, // missing required containerId
    { containerId: 'container-2', dnsBlock: ['evil.com'] },
  ];

  const result = parsePersistedArray(raw, NetworkRuleSchema, 'network-rules.json');

  expect(result).toEqual([
    { containerId: 'container-1', latencyMs: 100 },
    { containerId: 'container-2', dnsBlock: ['evil.com'] },
  ]);
  expect(warnSpy).toHaveBeenCalledTimes(2);
});

test('parsePersistedArray: should accept an empty array without warning', () => {
  const result = parsePersistedArray([], NetworkRuleSchema, 'network-rules.json');

  expect(result).toEqual([]);
  expect(warnSpy).not.toHaveBeenCalled();
});

test('NetworkRuleSchema: should reject an entry missing the required containerId', () => {
  expect(NetworkRuleSchema.safeParse({ latencyMs: 50 }).success).toBe(false);
});

test('IsolationRuleSchema: should reject an unknown isolation mode', () => {
  const result = IsolationRuleSchema.safeParse({
    containerId: 'c1',
    containerName: 'web',
    mode: 'teleport',
    startedAt: Date.now(),
  });

  expect(result.success).toBe(false);
});

test('IsolationRuleSchema: should accept a valid pause isolation', () => {
  const entry = { containerId: 'c1', containerName: 'web', mode: 'pause', startedAt: 123 };
  expect(IsolationRuleSchema.safeParse(entry)).toMatchObject({ success: true, data: entry });
});

test('StressInjectionSchema: should reject an unknown stress type', () => {
  const result = StressInjectionSchema.safeParse({
    containerId: 'c1',
    containerName: 'web',
    type: 'gpu-melt',
    startedAt: Date.now(),
  });

  expect(result.success).toBe(false);
});

test('AffectedContainerStateSchema: should reject a missing nested originalState', () => {
  const result = AffectedContainerStateSchema.safeParse({
    containerId: 'c1',
    containerName: 'web',
    engineId: 'e1',
    firstAffectedAt: 123,
    activeAttacks: ['resource-limit'],
  });

  expect(result.success).toBe(false);
});

test('AffectedContainerStateSchema: should accept a fully-formed entry', () => {
  const entry = {
    containerId: 'c1',
    containerName: 'web',
    engineId: 'e1',
    firstAffectedAt: 123,
    originalState: { wasRunning: true, networks: ['bridge'], cpuNanos: 0, memoryBytes: 0 },
    activeAttacks: ['resource-limit'],
  };

  expect(AffectedContainerStateSchema.safeParse(entry)).toMatchObject({ success: true, data: entry });
});

test('ScenarioSchema: should reject a step with an unknown attackType', () => {
  const result = ScenarioSchema.safeParse({
    id: 's1',
    name: 'Test',
    intervalSec: 30,
    targetStrategy: 'random',
    steps: [{ attackType: 'nuke' }],
    enabled: false,
  });

  expect(result.success).toBe(false);
});

test('ScenarioSchema: should accept a scenario with multiple valid steps', () => {
  const entry = {
    id: 's1',
    name: 'Test',
    intervalSec: 30,
    targetStrategy: 'random',
    steps: [{ attackType: 'stop' }, { attackType: 'resource-limit', cpuPercent: 50, memoryMb: 128 }],
    enabled: false,
  };

  expect(ScenarioSchema.safeParse(entry)).toMatchObject({ success: true, data: entry });
});
