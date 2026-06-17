<script lang="ts">
import { Button, NavPage, Dropdown, Tooltip, NumberInput, ErrorMessage } from '@podman-desktop/ui-svelte';
import { faTachometerAlt } from '@fortawesome/free-solid-svg-icons';
import { onMount } from 'svelte';
import { chaosClient } from '../api/client';
import type { ContainerHealth, ResourceLimit } from '/@shared/src/ChaosApi';

let containers: ContainerHealth[] = $state([]);
let selectedContainer = $state('');
let cpuPercent = $state(50);
let memoryMb = $state(64);
let activeLimits: Record<string, ResourceLimit> = $state({});
let errorMessage = $state('');

let containerOptions = $derived(
  [{ value: '', label: 'Select container...' }].concat(
    containers.filter(c => c.state === 'running').map(c => ({ value: c.id, label: c.name })),
  ),
);

async function refresh(): Promise<void> {
  try {
    containers = await chaosClient.getContainerHealth();
    const state = await chaosClient.getChaosState();
    activeLimits = state.resourceLimits;
  } catch (err) {
    errorMessage = `Failed to load data: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function applyLimit(): Promise<void> {
  if (!selectedContainer) return;
  try {
    errorMessage = '';
    await chaosClient.applyResourceLimit({
      containerId: selectedContainer,
      cpuPercent,
      memoryMb,
    });
    await refresh();
  } catch (err) {
    errorMessage = `Failed to apply resource limit: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function removeLimit(containerId: string): Promise<void> {
  try {
    errorMessage = '';
    await chaosClient.removeResourceLimit(containerId);
    await refresh();
  } catch (err) {
    errorMessage = `Failed to restore resource limit: ${err instanceof Error ? err.message : String(err)}`;
  }
}

onMount(() => {
  refresh();
});
</script>

<NavPage title="Resource Limiter" searchEnabled={false}>
  {#snippet content()}
    <div class="flex flex-col w-full p-5 gap-4">
      {#if errorMessage}
        <ErrorMessage error={errorMessage} />
      {/if}
      <div class="rounded-lg bg-[var(--pd-content-card-bg)] p-5 space-y-5">
        <div>
          <span class="block text-xs text-[var(--pd-content-text)] mb-1">Target Container</span>
          <Dropdown bind:value={selectedContainer} options={containerOptions} ariaLabel="Target container" />
        </div>

        <div class="grid grid-cols-2 gap-6">
          <div>
            <span class="block text-xs text-[var(--pd-content-text)] mb-2"
              >CPU Cores Limit ({(cpuPercent / 100).toFixed(2)} cores)</span>
            <NumberInput
              bind:value={cpuPercent}
              minimum={1}
              maximum={1600}
              step={1}
              type="integer"
              aria-label="CPU percent" />
          </div>
          <div>
            <span class="block text-xs text-[var(--pd-content-text)] mb-2">Memory Limit (MB)</span>
            <NumberInput
              bind:value={memoryMb}
              minimum={16}
              maximum={8192}
              step={16}
              type="integer"
              aria-label="Memory MB" />
          </div>
        </div>

        <Button type="primary" onclick={applyLimit} icon={faTachometerAlt}>Apply Resource Limit</Button>
      </div>

      {#if Object.keys(activeLimits).length > 0}
        <div>
          <h2 class="text-sm font-semibold text-[var(--pd-content-header)] mb-3">Active Limits</h2>
          <div class="space-y-2">
            {#each Object.entries(activeLimits) as [containerId, limit]}
              <div
                class="flex items-center justify-between rounded-lg bg-[var(--pd-content-card-bg)] hover:bg-[var(--pd-content-card-hover-bg)] p-4 transition-colors">
                <div class="flex items-center gap-4 text-sm">
                  <span class="font-medium text-[var(--pd-content-header)]">
                    {containers.find(c => c.id === containerId)?.name ?? containerId.substring(0, 12)}
                  </span>
                  <Tooltip tip="CPU cores restriction" bottom>
                    <span
                      class="px-2 py-0.5 rounded text-xs text-[var(--pd-status-contrast)] bg-[var(--pd-status-starting)]">
                      CPU: {(limit.cpuPercent / 100).toFixed(2)} cores
                    </span>
                  </Tooltip>
                  <Tooltip tip="Memory restriction" bottom>
                    <span
                      class="px-2 py-0.5 rounded text-xs text-[var(--pd-status-contrast)] bg-[var(--pd-button-primary-bg)]">
                      RAM: {limit.memoryMb} MB
                    </span>
                  </Tooltip>
                </div>
                <Button type="secondary" onclick={removeLimit.bind(undefined, containerId)}>Restore</Button>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/snippet}
</NavPage>
