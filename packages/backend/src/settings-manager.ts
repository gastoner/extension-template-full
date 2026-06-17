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

import type * as extensionApi from '@podman-desktop/api';
import type { ExtensionSettings } from '/@shared/src/SettingsApi';
import { DEFAULT_SETTINGS } from '/@shared/src/SettingsApi';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CONFIG_SECTION = 'chaos-lab';

export class SettingsManager {
  private current: ExtensionSettings = { ...DEFAULT_SETTINGS };
  private changeListeners: Array<(settings: ExtensionSettings) => void> = [];
  private disposable?: extensionApi.Disposable;

  load(): void {
    this.readConfig();

    // -------------------------------------------------------------------------
    // #8: Listen for configuration changes
    // Subscribe to extensionApi.configuration.onDidChangeConfiguration().
    // When the event affects CONFIG_SECTION ('chaos-lab'):
    //   1. Call this.readConfig() to refresh cached values
    //   2. Notify all registered change listeners with the new settings
    // Store the returned disposable in this.disposable for cleanup.
    // Hint: extensionApi.configuration.onDidChangeConfiguration(e => { ... })
    // Hint: e.affectsConfiguration(CONFIG_SECTION) to filter relevant changes
    // -------------------------------------------------------------------------
  }

  onSettingsChanged(listener: (settings: ExtensionSettings) => void): void {
    this.changeListeners.push(listener);
  }

  getSettings(): ExtensionSettings {
    return { ...this.current };
  }

  dispose(): void {
    this.disposable?.dispose();
    this.changeListeners = [];
  }

  private readConfig(): void {
    // -------------------------------------------------------------------------
    // #9: Read extension configuration values
    // Use extensionApi.configuration.getConfiguration(CONFIG_SECTION) to get
    // the configuration object, then read individual properties with config.get<T>():
    //   - 'chaosSafeContainers' (string) → parse with this.parseSafeContainers()
    //   - 'showStatusBarChaos' (boolean) → fall back to DEFAULT_SETTINGS value
    // Assign the result to this.current.
    // The parseSafeContainers() method below splits a comma-separated string
    // into an array of trimmed, non-empty patterns — use it for chaosSafeContainers.
    // Hint: extensionApi.configuration.getConfiguration(section)
    // Hint: config.get<string>('key') ?? defaultValue
    // -------------------------------------------------------------------------
    this.current = { ...DEFAULT_SETTINGS };
  }

  private parseSafeContainers(value: string): string[] {
    return value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
}
