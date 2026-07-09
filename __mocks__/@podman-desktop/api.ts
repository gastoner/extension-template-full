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
import { vi } from 'vitest';
import path from 'node:path';
import type * as podmanDesktopApi from '@podman-desktop/api';

function toUri(fsPath: string): podmanDesktopApi.Uri {
  return {
    scheme: 'file',
    authority: '',
    path: fsPath,
    fsPath,
    query: '',
    fragment: '',
    toString: () => `file://${fsPath}`,
  } as unknown as podmanDesktopApi.Uri;
}

const plugin = {
  Uri: {
    file: (fsPath: string) => toUri(fsPath),
    parse: (value: string) => toUri(value),
    joinPath: (base: podmanDesktopApi.Uri, ...segments: string[]) => toUri(path.join(base.fsPath, ...segments)),
  } as unknown as typeof podmanDesktopApi.Uri,
  EventEmitter: class<T> implements podmanDesktopApi.EventEmitter<T> {
    #set: Set<(t: T) => void> = new Set();

    get event(): podmanDesktopApi.Event<T> {
      return listener => {
        this.#set.add(listener);
        return {
          dispose: (): void => {
            this.#set.delete(listener);
          },
        };
      };
    }

    fire(data: T): void {
      this.#set.forEach(listener => listener(data));
    }

    dispose(): void {
      this.#set.clear();
    }
  },
  Disposable: {
    create: (fn: () => void): podmanDesktopApi.Disposable => ({ dispose: fn }),
  } as unknown as typeof podmanDesktopApi.Disposable,
  process: {
    exec: vi.fn(),
  } as unknown as typeof podmanDesktopApi.process,
  env: {} as unknown as typeof podmanDesktopApi.env,
  window: {
    showQuickPick: vi.fn(),
    withProgress: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    createWebviewPanel: vi.fn(),
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
  } as unknown as typeof podmanDesktopApi.window,
  commands: {
    registerCommand: vi.fn(),
  } as unknown as typeof podmanDesktopApi.commands,
  containerEngine: {
    listContainers: vi.fn(),
    stopContainer: vi.fn(),
    startContainer: vi.fn(),
    restartContainer: vi.fn(),
    onEvent: vi.fn(),
  } as unknown as typeof podmanDesktopApi.containerEngine,
  configuration: {
    getConfiguration: vi.fn(),
    onDidChangeConfiguration: vi.fn(),
  } as unknown as typeof podmanDesktopApi.configuration,
  provider: {
    getContainerConnections: vi.fn(),
    onDidRegisterContainerConnection: vi.fn(),
    onDidUnregisterContainerConnection: vi.fn(),
    onDidUpdateContainerConnection: vi.fn(),
  } as unknown as typeof podmanDesktopApi.provider,
  context: {
    setValue: vi.fn(),
  } as unknown as typeof podmanDesktopApi.context,
  StatusBarAlignLeft: 'LEFT',
  StatusBarAlignRight: 'RIGHT',
  StatusBarItemDefaultPriority: 0,
} as unknown as typeof podmanDesktopApi;

module.exports = plugin;
