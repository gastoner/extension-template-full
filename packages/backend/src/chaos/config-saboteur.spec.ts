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
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as podmanDesktopApi from '@podman-desktop/api';
import { process } from '@podman-desktop/api';
import { ConfigSaboteur } from './config-saboteur';
import type { ContainerService } from '../container-service';
import type { AffectedRegistry } from './affected-registry';
import type { SabotageType } from '/@shared/src/ChaosApi';

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

const secretStore = new Map<string, string>();
const mockSecretStorage = {
  get: vi.fn(),
  store: vi.fn(),
  delete: vi.fn(),
  onDidChange: vi.fn(),
} as unknown as podmanDesktopApi.SecretStorage;

let saboteur: ConfigSaboteur;

beforeEach(() => {
  vi.resetAllMocks();
  mockExec.mockResolvedValue({ stdout: 'nameserver 8.8.8.8\n', stderr: '', command: '' });
  vi.mocked(mockContainerService.listContainers).mockResolvedValue([
    { id: 'container-1', name: 'web-app', state: 'running', engineId: 'e1' },
    { id: 'container-2', name: 'api-srv', state: 'running', engineId: 'e1' },
  ] as Awaited<ReturnType<ContainerService['listContainers']>>);
  vi.mocked(mockContainerService.inspectContainer).mockResolvedValue({});

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

  vi.mocked(mockRegistry.markAffected).mockResolvedValue(undefined);
  vi.mocked(mockRegistry.removeAttack).mockResolvedValue(undefined);

  saboteur = new ConfigSaboteur(mockContainerService);
  saboteur.setRegistry(mockRegistry);
});

test('corrupt: dns-blackhole should read original resolv.conf and overwrite with loopback', async () => {
  await saboteur.corrupt('container-1', 'dns-blackhole');

  const catCall = mockExec.mock.calls.find((call: unknown[]) => (call[1] as string[]).includes('cat'));
  expect(catCall).toBeDefined();
  expect(catCall![1] as string[]).toContain('/etc/resolv.conf');

  const writeCall = mockExec.mock.calls.find((call: unknown[]) =>
    (call[1] as string[]).join(' ').includes('nameserver 127.0.0.1'),
  );
  expect(writeCall).toBeDefined();
});

test('corrupt: dns-blackhole should track as active with correct targetFile', async () => {
  await saboteur.corrupt('container-1', 'dns-blackhole');

  const active = saboteur.listSabotages();
  expect(active).toHaveLength(1);
  expect(active[0].type).toBe('dns-blackhole');
  expect(active[0].targetFile).toBe('/etc/resolv.conf');
});

test.each([
  { targetFile: '/etc/nginx/nginx.conf', description: 'specified file' },
  { targetFile: undefined, description: 'default /etc/hostname' },
])('corrupt: file-corrupt should target $description', async ({ targetFile }) => {
  await saboteur.corrupt('container-1', 'file-corrupt', targetFile);

  const expectedFile = targetFile ?? '/etc/hostname';
  const active = saboteur.listSabotages();
  expect(active[0].targetFile).toBe(expectedFile);
});

test('corrupt: file-corrupt should write random base64 content to the file', async () => {
  await saboteur.corrupt('container-1', 'file-corrupt', '/etc/hostname');

  const corruptCall = mockExec.mock.calls.find((call: unknown[]) =>
    (call[1] as string[]).join(' ').includes('/dev/urandom'),
  );
  expect(corruptCall).toBeDefined();
});

test('corrupt: replacing previous sabotage should restore before applying new sabotage on same container', async () => {
  await saboteur.corrupt('container-1', 'dns-blackhole');
  mockExec.mockClear();

  await saboteur.corrupt('container-1', 'file-corrupt');

  const restoreCall = mockExec.mock.calls.find((call: unknown[]) => (call[1] as string[]).join(' ').includes('printf'));
  expect(restoreCall).toBeDefined();

  expect(saboteur.listSabotages()).toHaveLength(1);
  expect(saboteur.listSabotages()[0].type).toBe('file-corrupt');
});

test.each([
  { pattern: 'web*', type: 'dns-blackhole' as SabotageType },
  { pattern: 'Web*', type: 'file-corrupt' as SabotageType },
])('corrupt: safe patterns should reject "$pattern" matched container for $type', async ({ pattern, type }) => {
  saboteur.setSafePatterns([pattern]);

  await expect(saboteur.corrupt('container-1', type)).rejects.toThrow('is in the safe list');
});

test('corrupt: should mark the container as affected only after the sabotage is successfully applied', async () => {
  await saboteur.corrupt('container-1', 'dns-blackhole');

  expect(mockRegistry.markAffected).toHaveBeenCalledTimes(1);
  expect(mockRegistry.markAffected).toHaveBeenCalledWith('container-1', 'config-dns-blackhole');
});

test('corrupt: should not mark the container as affected if the corrupt exec fails', async () => {
  mockExec.mockImplementation((_cmd: string, args?: string[]) => {
    if (args?.includes('cat')) {
      return Promise.resolve({ stdout: 'nameserver 8.8.8.8\n', stderr: '', command: '' });
    }
    return Promise.reject(new Error('corrupt exec failed'));
  });

  await expect(saboteur.corrupt('container-1', 'dns-blackhole')).rejects.toThrow('corrupt exec failed');

  expect(mockRegistry.markAffected).not.toHaveBeenCalled();
});

test('restore: should write original content back to the file', async () => {
  mockExec.mockResolvedValue({ stdout: 'original-content', stderr: '', command: '' });
  await saboteur.corrupt('container-1', 'dns-blackhole');
  mockExec.mockClear();

  await saboteur.restore('container-1');

  const restoreCall = mockExec.mock.calls.find((call: unknown[]) => (call[1] as string[]).join(' ').includes('printf'));
  expect(restoreCall).toBeDefined();
  expect((restoreCall![1] as string[]).join(' ')).toContain('/etc/resolv.conf');
});

test('restore: should remove the sabotage from tracking', async () => {
  await saboteur.corrupt('container-1', 'dns-blackhole');
  await saboteur.restore('container-1');

  expect(saboteur.listSabotages()).toHaveLength(0);
});

test('restore: should no-op if no sabotage active for the container', async () => {
  mockExec.mockClear();
  await saboteur.restore('nonexistent');

  expect(mockExec).not.toHaveBeenCalled();
});

test('restore: should handle restore failure gracefully', async () => {
  await saboteur.corrupt('container-1', 'dns-blackhole');
  mockExec.mockRejectedValueOnce(new Error('container gone'));

  await expect(saboteur.restore('container-1')).resolves.not.toThrow();
  expect(saboteur.listSabotages()).toHaveLength(0);
});

test('restore: should not retry after a failed attempt, permanently losing the original content', async () => {
  await saboteur.corrupt('container-1', 'dns-blackhole');
  mockExec.mockRejectedValueOnce(new Error('container gone'));
  await saboteur.restore('container-1');
  mockExec.mockClear();

  // Tracking was already dropped by the failed attempt above, so a second
  // restore has nothing left to retry with — the original content is gone for good.
  await saboteur.restore('container-1');

  expect(mockExec).not.toHaveBeenCalled();
});

test('restore: should write empty content when the original file did not exist before sabotage', async () => {
  mockExec.mockRejectedValueOnce(new Error('cat: no such file or directory'));
  await saboteur.corrupt('container-1', 'file-corrupt', '/etc/never-existed.conf');
  mockExec.mockClear();
  mockExec.mockResolvedValue({ stdout: '', stderr: '', command: '' });

  await saboteur.restore('container-1');

  const restoreCall = mockExec.mock.calls.find((call: unknown[]) => (call[1] as string[]).join(' ').includes('printf'));
  expect(restoreCall).toBeDefined();
  const restoreArgs = restoreCall![1] as string[];
  const shellCmd = restoreArgs[restoreArgs.length - 1];
  // Documents current (lossy) behavior: a file that never existed is recreated
  // empty on restore rather than being removed.
  expect(shellCmd).toBe(`printf '%s' '' > /etc/never-existed.conf`);
});

test('restore: should escape content so a real shell reconstructs the exact original bytes', async () => {
  const original = `it's a "quoted" value, a 'nested' quote, a $VAR, a \`backtick\`, and a\nnewline`;
  mockExec.mockResolvedValue({ stdout: original, stderr: '', command: '' });
  await saboteur.corrupt('container-1', 'file-corrupt', '/etc/app.conf');
  mockExec.mockClear();

  await saboteur.restore('container-1');

  const restoreCall = mockExec.mock.calls.find((call: unknown[]) => (call[1] as string[]).join(' ').includes('printf'));
  expect(restoreCall).toBeDefined();
  const restoreArgs = restoreCall![1] as string[];
  const shellCmd = restoreArgs[restoreArgs.length - 1];

  // Run the exact shell command the saboteur sends via `podman exec` against a
  // local temp file, proving the escaping reconstructs the exact original bytes.
  const dir = mkdtempSync(join(tmpdir(), 'chaos-restore-'));
  const target = join(dir, 'app.conf');
  try {
    execSync(shellCmd.replace('/etc/app.conf', target));
    expect(readFileSync(target, 'utf8')).toBe(original);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rollbackAll: should restore all active sabotages', async () => {
  await saboteur.corrupt('container-1', 'dns-blackhole');
  await saboteur.corrupt('container-2', 'file-corrupt');

  await saboteur.rollbackAll();

  expect(saboteur.listSabotages()).toHaveLength(0);
});

test('dispose: should clear tracking without exec calls', async () => {
  await saboteur.corrupt('container-1', 'dns-blackhole');
  mockExec.mockClear();

  saboteur.dispose();

  expect(saboteur.listSabotages()).toHaveLength(0);
  expect(mockExec).not.toHaveBeenCalled();
});

test('save/load: should store original content in secret storage and keep it out of the persisted metadata file', async () => {
  saboteur.setSecretStorage(mockSecretStorage);
  const dir = mkdtempSync(join(tmpdir(), 'chaos-saboteur-'));
  try {
    mockExec.mockResolvedValue({ stdout: 'secret-db-password=hunter2', stderr: '', command: '' });
    saboteur.setStoragePath(dir);

    await saboteur.corrupt('container-1', 'dns-blackhole');

    expect(mockSecretStorage.store).toHaveBeenCalledWith('config-sabotage.container-1', 'secret-db-password=hunter2');

    const raw = readFileSync(join(dir, 'config-sabotages.json'), 'utf8');
    expect(raw).not.toContain('secret-db-password');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should persist targetFile only once (nested under sabotage, not duplicated at the top level)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-saboteur-'));
  try {
    saboteur.setStoragePath(dir);
    await saboteur.corrupt('container-1', 'file-corrupt', '/etc/hostname');

    const raw = readFileSync(join(dir, 'config-sabotages.json'), 'utf8');
    const entries: Array<{ sabotage: { targetFile: string }; targetFile?: string }> = JSON.parse(raw);

    expect(entries).toHaveLength(1);
    expect(entries[0].sabotage.targetFile).toBe('/etc/hostname');
    expect(entries[0].targetFile).toBeUndefined();
    expect(Object.keys(entries[0])).toEqual(['sabotage']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should delete the secret when the sabotage is restored', async () => {
  saboteur.setSecretStorage(mockSecretStorage);
  const dir = mkdtempSync(join(tmpdir(), 'chaos-saboteur-'));
  try {
    saboteur.setStoragePath(dir);
    await saboteur.corrupt('container-1', 'dns-blackhole');

    await saboteur.restore('container-1');

    expect(mockSecretStorage.delete).toHaveBeenCalledWith('config-sabotage.container-1');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should reload original content from secret storage and restore the exact bytes', async () => {
  saboteur.setSecretStorage(mockSecretStorage);
  const dir = mkdtempSync(join(tmpdir(), 'chaos-saboteur-'));
  try {
    mockExec.mockResolvedValue({ stdout: 'original-resolv-conf-content', stderr: '', command: '' });
    saboteur.setStoragePath(dir);
    await saboteur.corrupt('container-1', 'dns-blackhole');

    const reloaded = new ConfigSaboteur(mockContainerService);
    reloaded.setStoragePath(dir);
    reloaded.setSecretStorage(mockSecretStorage);
    await reloaded.load();

    expect(reloaded.listSabotages()).toHaveLength(1);

    mockExec.mockClear();
    await reloaded.restore('container-1');

    const restoreCall = mockExec.mock.calls.find((call: unknown[]) =>
      (call[1] as string[]).join(' ').includes('printf'),
    );
    expect(restoreCall).toBeDefined();
    expect((restoreCall![1] as string[]).join(' ')).toContain('original-resolv-conf-content');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should skip an entry whose secret is missing rather than restoring garbage content', async () => {
  saboteur.setSecretStorage(mockSecretStorage);
  const dir = mkdtempSync(join(tmpdir(), 'chaos-saboteur-'));
  try {
    saboteur.setStoragePath(dir);
    await saboteur.corrupt('container-1', 'dns-blackhole');
    await mockSecretStorage.delete('config-sabotage.container-1');

    const reloaded = new ConfigSaboteur(mockContainerService);
    reloaded.setStoragePath(dir);
    reloaded.setSecretStorage(mockSecretStorage);

    await reloaded.load();

    expect(reloaded.listSabotages()).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should start fresh if no persisted file exists', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-saboteur-'));
  try {
    saboteur.setStoragePath(dir);
    await expect(saboteur.load()).resolves.not.toThrow();
    expect(saboteur.listSabotages()).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('save/load: should skip malformed persisted entries without crashing, keeping the valid ones', async () => {
  saboteur.setSecretStorage(mockSecretStorage);
  const dir = mkdtempSync(join(tmpdir(), 'chaos-saboteur-'));
  try {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await mockSecretStorage.store('config-sabotage.container-valid', 'original-content');
    const valid = {
      sabotage: {
        containerId: 'container-valid',
        containerName: 'web',
        type: 'dns-blackhole',
        targetFile: '/etc/resolv.conf',
        startedAt: Date.now(),
      },
    };
    const malformed = { sabotage: { containerId: 'container-bad', type: 'dns-blackhole' } }; // missing required fields
    writeFileSync(join(dir, 'config-sabotages.json'), JSON.stringify([valid, malformed]), 'utf8');

    saboteur.setStoragePath(dir);
    await saboteur.load();

    expect(saboteur.listSabotages().map(s => s.containerId)).toEqual(['container-valid']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('config-sabotages.json'));

    warnSpy.mockRestore();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
