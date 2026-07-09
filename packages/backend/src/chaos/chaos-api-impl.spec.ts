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
import fs, { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { process, window, Uri } from '@podman-desktop/api';
import { ChaosApiImpl } from './chaos-api-impl';
import { ChaosEngine } from './chaos-engine';
import type { ContainerService } from '../container-service';
import type { Scenario } from '/@shared/src/ChaosApi';

const mockExec = vi.mocked(process.exec);
const mockShowSaveDialog = vi.mocked(window.showSaveDialog);
const mockShowOpenDialog = vi.mocked(window.showOpenDialog);

const mockContainerService = {
  listContainers: vi.fn(),
  getAllStats: vi.fn(),
  getContainerNetworks: vi.fn(),
  connectToNetwork: vi.fn(),
  startContainer: vi.fn(),
  checkToolAvailability: vi.fn(),
  inspectContainer: vi.fn(),
  invalidateCache: vi.fn(),
} as unknown as ContainerService;

let engine: ChaosEngine;
let api: ChaosApiImpl;

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

beforeEach(async () => {
  vi.resetAllMocks();
  mockExec.mockResolvedValue({ stdout: '', stderr: '', command: '' });
  vi.mocked(mockContainerService.listContainers).mockResolvedValue([
    { id: 'container-1', name: 'web-app', state: 'running', engineId: 'e1' },
    { id: 'container-2', name: 'api-srv', state: 'running', engineId: 'e1' },
  ] as Awaited<ReturnType<ContainerService['listContainers']>>);
  vi.mocked(mockContainerService.getAllStats).mockResolvedValue([]);
  vi.mocked(mockContainerService.getContainerNetworks).mockResolvedValue(['bridge']);
  vi.mocked(mockContainerService.connectToNetwork).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.startContainer).mockResolvedValue(undefined);
  vi.mocked(mockContainerService.checkToolAvailability).mockResolvedValue(true);
  vi.mocked(mockContainerService.inspectContainer).mockResolvedValue({
    HostConfig: { NanoCpus: 2000000000, Memory: 536870912 },
  });

  engine = new ChaosEngine(mockContainerService);
  api = new ChaosApiImpl(engine, mockContainerService);
  await api.setNotificationsEnabled(false);
});

test('revertContainer: should restore original CPU/memory and reconnect original networks', async () => {
  await api.applyResourceLimit({ containerId: 'container-1', cpuPercent: 50, memoryMb: 128 });
  mockExec.mockClear();

  await api.revertContainer('container-1');

  expect(mockExec).toHaveBeenCalledWith(
    'podman',
    expect.arrayContaining(['update', 'container-1', '--cpus', '2.00', '--memory', '512m']),
  );
  expect(mockContainerService.connectToNetwork).toHaveBeenCalledWith('container-1', 'bridge');
});

test('revertContainer: should clear the container from both the subsystem and the affected registry', async () => {
  await api.applyResourceLimit({ containerId: 'container-1', cpuPercent: 50, memoryMb: 128 });

  await api.revertContainer('container-1');

  expect(engine.resourceLimiter.getActiveLimits()['container-1']).toBeUndefined();
  expect(engine.affectedRegistry.getEntry('container-1')).toBeUndefined();
});

test('revertContainer: should no-op gracefully for a container that was never affected', async () => {
  await expect(api.revertContainer('nonexistent')).resolves.not.toThrow();
});

test('revertAllContainers: should revert every currently affected container', async () => {
  await api.applyResourceLimit({ containerId: 'container-1', cpuPercent: 50, memoryMb: 128 });
  await api.applyNetworkRule({ containerId: 'container-2', latencyMs: 100 });

  await api.revertAllContainers();

  expect(Object.keys(engine.resourceLimiter.getActiveLimits())).toHaveLength(0);
  expect(Object.keys(engine.networkShaper.getActiveRules())).toHaveLength(0);
  expect(engine.affectedRegistry.getAffected()).toHaveLength(0);
});

test('revertAllContainers: should revert each affected container exactly as revertContainer would, without an engine.stopAll shortcut', async () => {
  await api.applyResourceLimit({ containerId: 'container-1', cpuPercent: 50, memoryMb: 128 });
  const stopAllSpy = vi.spyOn(engine, 'stopAll');
  const revertContainerSpy = vi.spyOn(api, 'revertContainer');

  await api.revertAllContainers();

  expect(stopAllSpy).not.toHaveBeenCalled();
  expect(revertContainerSpy).toHaveBeenCalledTimes(1);
  expect(revertContainerSpy).toHaveBeenCalledWith('container-1');
});

test('revertAllContainers: should no-op gracefully when no containers are affected', async () => {
  await expect(api.revertAllContainers()).resolves.not.toThrow();
});

test('exportScenarios: should notify and skip the save dialog when there are no scenarios', async () => {
  await api.exportScenarios();

  expect(mockShowSaveDialog).not.toHaveBeenCalled();
});

test('exportScenarios: should default the save dialog to ~/Documents', async () => {
  engine.scheduler.addScenario(makeScenario());
  mockShowSaveDialog.mockResolvedValue(undefined);

  await api.exportScenarios();

  const expectedPath = join(homedir(), 'Documents', 'chaos-scenarios.json');
  expect(mockShowSaveDialog).toHaveBeenCalledWith(
    expect.objectContaining({ defaultUri: expect.objectContaining({ fsPath: expectedPath }) }),
  );
});

test('exportScenarios: should write all scenarios as JSON to the chosen file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-export-'));
  try {
    engine.scheduler.addScenario(makeScenario({ id: 'scenario-1', name: 'Export me' }));
    const target = join(dir, 'out.json');
    mockShowSaveDialog.mockResolvedValue(Uri.file(target));

    await api.exportScenarios();

    const written = JSON.parse(readFileSync(target, 'utf8'));
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ id: 'scenario-1', name: 'Export me' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exportScenarios: should only write the scenarios matching the given ids', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-export-'));
  try {
    engine.scheduler.addScenario(makeScenario({ id: 'scenario-1', name: 'Keep me' }));
    engine.scheduler.addScenario(makeScenario({ id: 'scenario-2', name: 'Skip me' }));
    const target = join(dir, 'out.json');
    mockShowSaveDialog.mockResolvedValue(Uri.file(target));

    await api.exportScenarios(['scenario-1']);

    const written = JSON.parse(readFileSync(target, 'utf8'));
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ id: 'scenario-1', name: 'Keep me' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exportScenarios: should notify and skip the save dialog when the given ids match no scenario', async () => {
  engine.scheduler.addScenario(makeScenario({ id: 'scenario-1' }));

  await api.exportScenarios(['nonexistent']);

  expect(mockShowSaveDialog).not.toHaveBeenCalled();
});

test('exportScenarios: should not write anything when the save dialog is canceled', async () => {
  engine.scheduler.addScenario(makeScenario());
  const writeSpy = vi.spyOn(fs.promises, 'writeFile');
  mockShowSaveDialog.mockResolvedValue(undefined);

  await api.exportScenarios();

  expect(writeSpy).not.toHaveBeenCalled();
  writeSpy.mockRestore();
});

test('importScenarios: should not add anything when the open dialog is canceled', async () => {
  mockShowOpenDialog.mockResolvedValue(undefined);

  await api.importScenarios();

  expect(engine.scheduler.listScenarios()).toHaveLength(0);
});

test('importScenarios: should add scenarios from the selected file with a fresh id and disabled', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-import-'));
  try {
    const filePath = join(dir, 'scenarios.json');
    writeFileSync(filePath, JSON.stringify([makeScenario({ id: 'original-id', enabled: true })]), 'utf8');
    mockShowOpenDialog.mockResolvedValue([Uri.file(filePath)]);

    await api.importScenarios();

    const scenarios = engine.scheduler.listScenarios();
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].id).not.toBe('original-id');
    expect(scenarios[0].enabled).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('importScenarios: should skip malformed entries and only import the valid ones', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-import-'));
  try {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const filePath = join(dir, 'scenarios.json');
    const malformed = { id: 'bad', name: 'Bad', steps: [{ attackType: 'nuke' }] };
    writeFileSync(filePath, JSON.stringify([makeScenario({ id: 'good' }), malformed]), 'utf8');
    mockShowOpenDialog.mockResolvedValue([Uri.file(filePath)]);

    await api.importScenarios();

    expect(engine.scheduler.listScenarios()).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('importScenarios: should notify and no-op when the file contains no valid scenarios', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-import-'));
  try {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const filePath = join(dir, 'scenarios.json');
    writeFileSync(filePath, JSON.stringify([{ not: 'a scenario' }]), 'utf8');
    mockShowOpenDialog.mockResolvedValue([Uri.file(filePath)]);

    await expect(api.importScenarios()).resolves.not.toThrow();

    expect(engine.scheduler.listScenarios()).toHaveLength(0);

    warnSpy.mockRestore();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('importScenarios: should notify and no-op gracefully when the selected file is not valid JSON', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-import-'));
  try {
    const filePath = join(dir, 'scenarios.json');
    writeFileSync(filePath, 'not json at all', 'utf8');
    mockShowOpenDialog.mockResolvedValue([Uri.file(filePath)]);

    await expect(api.importScenarios()).resolves.not.toThrow();

    expect(engine.scheduler.listScenarios()).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('toggleScenario: starting a scenario only flips it enabled, without touching any container', async () => {
  engine.scheduler.addScenario(makeScenario({ targetStrategy: 'all', steps: [{ attackType: 'resource-limit' }] }));

  await api.toggleScenario('scenario-1', true);

  expect(engine.scheduler.listScenarios()[0].enabled).toBe(true);
  expect(Object.keys(engine.resourceLimiter.getActiveLimits())).toHaveLength(0);
});

test('toggleScenario: stopping a scenario reverts every attack it caused', async () => {
  engine.scheduler.addScenario(
    makeScenario({ targetStrategy: 'all', steps: [{ attackType: 'resource-limit', cpuPercent: 50, memoryMb: 64 }] }),
  );
  await api.runScenarioOnce('scenario-1');
  expect(Object.keys(engine.resourceLimiter.getActiveLimits())).toHaveLength(2);

  await api.toggleScenario('scenario-1', false);

  expect(engine.scheduler.listScenarios()[0].enabled).toBe(false);
  expect(Object.keys(engine.resourceLimiter.getActiveLimits())).toHaveLength(0);
  // The registry entries for these containers may still exist (same as removing a single
  // attack via a subsystem tab), but neither should report any attack as still active.
  expect(engine.affectedRegistry.getAffected().flatMap(entry => entry.activeAttacks)).toHaveLength(0);
});
