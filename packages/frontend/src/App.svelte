<script lang="ts">
import './app.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { router } from 'tinro';
import Route from './lib/Route.svelte';
import { onMount, onDestroy } from 'svelte';
import { getRouterState } from './api/client';
import Navigation from './Navigation.svelte';

import ChaosLab from './chaos/ChaosLab.svelte';
import Scenarios from './chaos/Scenarios.svelte';
import NetworkShaperPage from './chaos/NetworkShaper.svelte';
import ResourceLimiterPage from './chaos/ResourceLimiter.svelte';
import ContainerIsolatorPage from './chaos/ContainerIsolator.svelte';
import ContainerDetail from './chaos/ContainerDetail.svelte';

router.mode.hash();
let isMounted = false;

function handleBackendMessage(event: MessageEvent): void {
  const message = event.data;
  if (message?.type === 'navigate' && typeof message.url === 'string') {
    router.goto(message.url);
  }
}

onMount(() => {
  window.addEventListener('message', handleBackendMessage);
  const state = getRouterState();
  router.goto(state.url || '/chaos');
  isMounted = true;
});

onDestroy(() => {
  window.removeEventListener('message', handleBackendMessage);
});
</script>

<Route path="/*" breadcrumb="Chaos Lab" isAppMounted={isMounted} let:meta>
  <main class="flex flex-col w-screen h-screen overflow-hidden bg-[var(--pd-content-bg)]">
    <div class="flex flex-row w-full h-full overflow-hidden">
      <Navigation {meta} />

      <div class="flex flex-col w-full h-full overflow-hidden">
        <Route path="/" breadcrumb="Dashboard">
          <ChaosLab />
        </Route>
        <Route path="/chaos" breadcrumb="Dashboard">
          <ChaosLab />
        </Route>
        <Route path="/chaos/scenarios" breadcrumb="Scenarios">
          <Scenarios />
        </Route>
        <Route path="/chaos/network" breadcrumb="Network Shaper">
          <NetworkShaperPage />
        </Route>
        <Route path="/chaos/resources" breadcrumb="Resource Limiter">
          <ResourceLimiterPage />
        </Route>
        <Route path="/chaos/isolate" breadcrumb="Container Isolator">
          <ContainerIsolatorPage />
        </Route>
        <Route path="/chaos/container/:id" breadcrumb="Container Detail" let:params>
          <ContainerDetail containerId={params.id} />
        </Route>
      </div>
    </div>
  </main>
</Route>
