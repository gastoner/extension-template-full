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

import type { ExtensionsPage } from '@podman-desktop/tests-playwright';
import {
  expect as playExpect,
  test,
  RunnerOptions,
  waitForPodmanMachineStartup,
} from '@podman-desktop/tests-playwright';
import { ExtensionChaosLabDetailsPage } from 'src/model/chaoslab-extension-details-page';
import { ChaosLabNavigationBar } from 'src/model/chaoslab-navigation-bar';
import { handleWebview } from 'src/utils/webviewHandler';

const CHAOSLAB_EXTENSION_OCI_IMAGE =
  process.env.EXTENSION_OCI_IMAGE ?? 'ghcr.io/podman-desktop/pd-extension-chaoslab:latest';
const CHAOSLAB_EXTENSION_PREINSTALLED: boolean = process.env.SKIP_INSTALLATION === 'true';
const CHAOSLAB_CATALOG_EXTENSION_LABEL: string = 'yourusername.chaos-lab';
const CHAOSLAB_CATALOG_EXTENSION_NAME: string = 'Chaos Lab';
const CHAOSLAB_CATALOG_STATUS_ACTIVE: string = 'ACTIVE';

const QUAY_HELLO_IMAGE_REPO = 'quay.io/podman/hello';
const QUAY_HELLO_IMAGE_TAG = 'latest';
const QUAY_HELLO_IMAGE = `${QUAY_HELLO_IMAGE_REPO}:${QUAY_HELLO_IMAGE_TAG}`;

test.use({
  runnerOptions: new RunnerOptions({
    customFolder: 'pd-extension-chaoslab-tests',
    /**
     * For performance reasons, disable extensions which are not necessary for the e2e
     */
    customSettings: {
      'extensions.disabled': [
        'podman-desktop.compose',
        'podman-desktop.docker',
        'podman-desktop.kind',
        'podman-desktop.kube-context',
        'podman-desktop.kubectl-cli',
        'podman-desktop.lima',
        'podman-desktop.minikube',
        'podman-desktop.registries',
      ],
    },
  }),
});

test.beforeAll(async ({ runner, welcomePage, page }) => {
  // 80s timeout
  test.setTimeout(80_000);

  runner.setVideoAndTraceName('chaoslab-e2e');
  await welcomePage.handleWelcomePage(true);
  await waitForPodmanMachineStartup(page, 80_000); // default is 30s let's increase that to 80s
  console.log(`We will pull image: ${QUAY_HELLO_IMAGE}`);
});

test.afterAll(async ({ runner }) => {
  test.setTimeout(200_000);
  await runner.close();
});

test.describe.serial(`ChaosLab extension installation and verification`, { tag: '@smoke' }, () => {
  test.describe.serial(`ChaosLab extension installation`, () => {
    let extensionsPage: ExtensionsPage;

    test(`Open Settings -> Extensions page`, async ({ navigationBar }) => {
      const dashboardPage = await navigationBar.openDashboard();
      await playExpect(dashboardPage.mainPage).toBeVisible();
      extensionsPage = await navigationBar.openExtensions();
      await playExpect(extensionsPage.header).toBeVisible();
    });

    test(`Install ChaosLab extension`, async () => {
      test.skip(CHAOSLAB_EXTENSION_PREINSTALLED, 'ChaosLab extension is preinstalled');
      await extensionsPage.installExtensionFromOCIImage(CHAOSLAB_EXTENSION_OCI_IMAGE);
    });

    test('Extension (card) is installed, present and active', async ({ navigationBar }) => {
      const extensions = await navigationBar.openExtensions();
      await playExpect
        .poll(async () => await extensions.extensionIsInstalled(CHAOSLAB_CATALOG_EXTENSION_LABEL), {
          timeout: 30000,
        })
        .toBeTruthy();
      const extensionCard = await extensions.getInstalledExtension(
        CHAOSLAB_CATALOG_EXTENSION_NAME,
        CHAOSLAB_CATALOG_EXTENSION_LABEL,
      );
      await playExpect(extensionCard.status).toHaveText(CHAOSLAB_CATALOG_STATUS_ACTIVE);
    });

    test(`Extension's details show correct status, no error`, async ({ page, navigationBar }) => {
      const extensions = await navigationBar.openExtensions();
      const extensionCard = await extensions.getInstalledExtension('chaos-lab', CHAOSLAB_CATALOG_EXTENSION_LABEL);
      await extensionCard.openExtensionDetails(CHAOSLAB_CATALOG_EXTENSION_NAME);
      const details = new ExtensionChaosLabDetailsPage(page);
      await playExpect(details.heading).toBeVisible();
      await playExpect(details.status).toHaveText(CHAOSLAB_CATALOG_STATUS_ACTIVE);
      const errorTab = details.tabs.getByRole('button', { name: 'Error' });
      // we would like to propagate the error's stack trace into test failure message
      let stackTrace = '';
      if ((await errorTab.count()) > 0) {
        await details.activateTab('Error');
        stackTrace = await details.errorStackTrace.innerText();
      }
      await playExpect(errorTab, `Error Tab was present with stackTrace: ${stackTrace}`).not.toBeVisible();
    });
  });

  test.describe.serial(`ChaosLab webview navigation`, () => {
    let chaosLabNavBar: ChaosLabNavigationBar;

    test(`Open ChaosLab webview and verify dashboard heading`, async ({ runner, page, navigationBar }) => {
      const [mainPage, webViewPage] = await handleWebview(runner, page, navigationBar);
      chaosLabNavBar = new ChaosLabNavigationBar(mainPage, webViewPage);
      await chaosLabNavBar.waitForLoad();
      const dashboardPage = await chaosLabNavBar.openDashboard();
      await playExpect(dashboardPage.heading).toBeVisible();
    });

    test(`Open Scenarios page and verify heading`, async () => {
      const scenariosPage = await chaosLabNavBar.openScenariosCatalog();
      await playExpect(scenariosPage.heading).toBeVisible();
    });

    test(`Open Network Shaper page and verify heading`, async () => {
      const networkShaperPage = await chaosLabNavBar.openNetworkShaper();
      await playExpect(networkShaperPage.heading).toBeVisible();
    });

    test(`Open Resource Limiter page and verify heading`, async () => {
      const resourceLimiterPage = await chaosLabNavBar.openResourceLimiter();
      await playExpect(resourceLimiterPage.heading).toBeVisible();
    });

    test(`Open Container Isolator page and verify heading`, async () => {
      const containerIsolatorPage = await chaosLabNavBar.openContainerIsolator();
      await playExpect(containerIsolatorPage.heading).toBeVisible();
    });
  });
});
