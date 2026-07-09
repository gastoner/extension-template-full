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

// Runtime schemas for every chaos subsystem's persisted JSON file. Each subsystem's
// load() parses its file with the matching schema below instead of blindly trusting
// `JSON.parse(raw) as SomeType[]` — a manually edited or partially-written file, or a
// shape that drifted from an older extension version, is rejected per-entry with a
// warning rather than silently producing runtime state that doesn't match its type.
//
// These intentionally mirror (rather than replace) the shared interfaces in
// `/@shared/src/ChaosApi`: shared/ holds the compile-time RPC contract consumed by the
// frontend too, while this file is a backend-only, disk-format concern.

import { z } from 'zod';

export const NetworkRuleSchema = z.object({
  containerId: z.string(),
  latencyMs: z.number().optional(),
  packetLossPercent: z.number().optional(),
  bandwidthKbps: z.number().optional(),
  dnsBlock: z.array(z.string()).optional(),
});

const ResourceLimitSchema = z.object({
  containerId: z.string(),
  cpuPercent: z.number(),
  memoryMb: z.number(),
  deviceReadBpsKB: z.number().optional(),
  deviceWriteBpsKB: z.number().optional(),
});

const OriginalLimitsSchema = z.object({
  cpus: z.string(),
  memory: z.string(),
});

export const PersistedResourceLimitSchema = z.object({
  limit: ResourceLimitSchema,
  original: OriginalLimitsSchema,
});

export const IsolationRuleSchema = z.object({
  containerId: z.string(),
  containerName: z.string(),
  mode: z.enum(['pause', 'network-disconnect', 'network-partition']),
  partitionPeers: z.array(z.string()).optional(),
  disconnectedNetworks: z.array(z.string()).optional(),
  autoRestoreAfterSec: z.number().optional(),
  startedAt: z.number(),
});

export const StressInjectionSchema = z.object({
  containerId: z.string(),
  containerName: z.string(),
  type: z.enum(['cpu', 'memory', 'memory-oom', 'log-flood']),
  workers: z.number().optional(),
  targetMb: z.number().optional(),
  startedAt: z.number(),
});

const ConfigSabotageSchema = z.object({
  containerId: z.string(),
  containerName: z.string(),
  type: z.enum(['dns-blackhole', 'file-corrupt']),
  targetFile: z.string(),
  startedAt: z.number(),
});

export const PersistedSabotageSchema = z.object({
  sabotage: ConfigSabotageSchema,
});

export const AffectedContainerStateSchema = z.object({
  containerId: z.string(),
  containerName: z.string(),
  engineId: z.string(),
  firstAffectedAt: z.number(),
  originalState: z.object({
    wasRunning: z.boolean(),
    networks: z.array(z.string()),
    cpuNanos: z.number(),
    memoryBytes: z.number(),
  }),
  activeAttacks: z.array(z.string()),
});

const AttackTypeSchema = z.enum([
  'stop',
  'kill',
  'pause',
  'restart',
  'network-shape',
  'resource-limit',
  'network-disconnect',
  'stress',
  'config-sabotage',
]);

const ScenarioStepSchema = z.object({
  attackType: AttackTypeSchema,
  delaySec: z.number().optional(),
  targetContainerIds: z.array(z.string()).optional(),
  latencyMs: z.number().optional(),
  packetLossPercent: z.number().optional(),
  bandwidthKbps: z.number().optional(),
  cpuPercent: z.number().optional(),
  memoryMb: z.number().optional(),
  disconnectNetworks: z.array(z.string()).optional(),
});

export const ScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  intervalSec: z.number(),
  targetStrategy: z.enum(['random', 'specific', 'all']),
  targetIds: z.array(z.string()).optional(),
  steps: z.array(ScenarioStepSchema),
  enabled: z.boolean(),
});

/**
 * Parses a persisted JSON array, validating each entry against `schema` individually so
 * a single corrupt/stale row doesn't discard the rest of an otherwise-valid file. Invalid
 * entries are dropped with a console warning that includes the reason.
 */
export function parsePersistedArray<T>(raw: unknown, schema: z.ZodType<T>, fileLabel: string): T[] {
  if (!Array.isArray(raw)) {
    console.warn(`Ignoring persisted ${fileLabel}: expected an array at the top level`);
    return [];
  }

  const results: T[] = [];
  for (const [index, item] of raw.entries()) {
    const parsed = schema.safeParse(item);
    if (!parsed.success) {
      console.warn(`Skipping invalid entry ${index} in persisted ${fileLabel}: ${parsed.error.message}`);
      continue;
    }
    results.push(parsed.data);
  }
  return results;
}
