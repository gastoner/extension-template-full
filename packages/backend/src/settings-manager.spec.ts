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
import { SettingsManager } from './settings-manager';

const mockGet = vi.fn();
const mockGetConfiguration = vi.fn();
const mockOnDidChange = vi.fn();

vi.mock('@podman-desktop/api', () => ({
  configuration: {
    getConfiguration: (...args: unknown[]) => mockGetConfiguration(...args),
    onDidChangeConfiguration: (...args: unknown[]) => mockOnDidChange(...args),
  },
}));

describe('SettingsManager', () => {
  let manager: SettingsManager;

  beforeEach(() => {
    vi.resetAllMocks();
    mockGet.mockReturnValue(undefined);
    mockGetConfiguration.mockReturnValue({ get: mockGet });
    mockOnDidChange.mockReturnValue({ dispose: vi.fn() });

    manager = new SettingsManager();
    manager.load();
  });

  it('should return default settings when no config is set', () => {
    const settings = manager.getSettings();
    expect(settings.chaosSafeContainers).toEqual([]);
    expect(settings.showStatusBarChaos).toBe(true);
  });

  it('should return a copy of settings (not a reference)', () => {
    const s1 = manager.getSettings();
    const s2 = manager.getSettings();
    expect(s1).not.toBe(s2);
    expect(s1).toEqual(s2);
  });

  it('should register change listeners', () => {
    const listener = vi.fn();
    manager.onSettingsChanged(listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it('should dispose cleanly', () => {
    manager.dispose();
  });
});
