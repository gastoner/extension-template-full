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

import type { Locator, Page } from '@playwright/test';
import { expect as playExpect } from '@playwright/test';
import { ChaosLabBasePage } from 'src/model/chaoslab-base-page';
import { ChaosLabContainerIsolatorPage } from 'src/model/chaoslab-container-isolator-page';
import { ChaosLabDashboardPage } from 'src/model/chaoslab-dashboard-page';
import { ChaosLabNetworkShaperPage } from 'src/model/chaoslab-network-shaper-page';
import { ChaosLabResourceLimiterPage } from 'src/model/chaoslab-resource-limiter-page';
import { ChaosLabScenariosPage } from 'src/model/chaoslab-scenarios-page';

export class ChaosLabNavigationBar extends ChaosLabBasePage {
  readonly navigationBar: Locator;
  readonly dashboardButton: Locator;
  readonly scenariosButton: Locator;
  readonly networkShaperButton: Locator;
  readonly resourceLimiterButton: Locator;
  readonly containerIsolatorButton: Locator;

  constructor(page: Page, webview: Page) {
    super(page, webview, undefined);
    this.navigationBar = this.webview.getByRole('navigation', { name: 'ChaosLabNavigation' });
    this.dashboardButton = this.navigationBar.getByRole('link', { name: 'Dashboard', exact: true });
    this.scenariosButton = this.navigationBar.getByRole('link', { name: 'Scenarios', exact: true });
    this.networkShaperButton = this.navigationBar.getByRole('link', { name: 'Network Shaper', exact: true });
    this.resourceLimiterButton = this.navigationBar.getByRole('link', { name: 'Resource Limiter', exact: true });
    this.containerIsolatorButton = this.navigationBar.getByRole('link', { name: 'Container Isolator', exact: true });
  }

  async waitForLoad(): Promise<void> {
    await playExpect(this.navigationBar).toBeVisible();
  }

  async openDashboard(): Promise<ChaosLabDashboardPage> {
    await playExpect(this.dashboardButton).toBeVisible();
    await this.dashboardButton.click();
    return new ChaosLabDashboardPage(this.page, this.webview);
  }

  async openScenariosCatalog(): Promise<ChaosLabScenariosPage> {
    await playExpect(this.scenariosButton).toBeVisible();
    await this.scenariosButton.click();
    return new ChaosLabScenariosPage(this.page, this.webview);
  }

  async openNetworkShaper(): Promise<ChaosLabNetworkShaperPage> {
    await playExpect(this.networkShaperButton).toBeVisible();
    await this.networkShaperButton.click();
    return new ChaosLabNetworkShaperPage(this.page, this.webview);
  }

  async openResourceLimiter(): Promise<ChaosLabResourceLimiterPage> {
    await playExpect(this.resourceLimiterButton).toBeVisible();
    await this.resourceLimiterButton.click();
    return new ChaosLabResourceLimiterPage(this.page, this.webview);
  }

  async openContainerIsolator(): Promise<ChaosLabContainerIsolatorPage> {
    await playExpect(this.containerIsolatorButton).toBeVisible();
    await this.containerIsolatorButton.click();
    return new ChaosLabContainerIsolatorPage(this.page, this.webview);
  }
}
