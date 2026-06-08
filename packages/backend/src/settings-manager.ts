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

import * as extensionApi from '@podman-desktop/api';
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

    this.disposable = extensionApi.configuration.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        this.readConfig();
        for (const listener of this.changeListeners) {
          listener(this.current);
        }
      }
    });
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
    const config = extensionApi.configuration.getConfiguration(CONFIG_SECTION);

    this.current = {
      chaosSafeContainers: this.parseSafeContainers(config.get<string>('chaosSafeContainers') ?? ''),
      showStatusBarChaos: config.get<boolean>('showStatusBarChaos') ?? DEFAULT_SETTINGS.showStatusBarChaos,
    };
  }

  private parseSafeContainers(value: string): string[] {
    return value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
}
