<script lang="ts">
import { Button, NavPage, Dropdown, Tooltip, Input, NumberInput, ErrorMessage } from '@podman-desktop/ui-svelte';
import { faNetworkWired } from '@fortawesome/free-solid-svg-icons';
import { onMount } from 'svelte';
import { chaosClient } from '../api/client';
import type { ContainerHealth, NetworkRule } from '/@shared/src/ChaosApi';

let containers: ContainerHealth[] = $state([]);
let selectedContainer = $state('');
let latencyMs = $state(100);
let packetLossPercent = $state(5);
let bandwidthKbps = $state(1000);
let dnsBlockInput = $state('');
let activeRules: Record<string, NetworkRule> = $state({});
let errorMessage = $state('');
let tcAvailable: boolean | undefined = $state(undefined);
let installing = $state(false);

let containerOptions = $derived(
  [{ value: '', label: 'Select container...' }].concat(
    containers.filter(c => c.state === 'running').map(c => ({ value: c.id, label: c.name })),
  ),
);

async function refresh(): Promise<void> {
  try {
    containers = await chaosClient.getContainerHealth();
    const state = await chaosClient.getChaosState();
    activeRules = state.networkRules;
  } catch (err) {
    errorMessage = `Failed to load data: ${err instanceof Error ? err.message : String(err)}`;
  }
}

$effect(() => {
  if (!selectedContainer) {
    tcAvailable = undefined;
    return;
  }
  chaosClient
    .checkContainerTool(selectedContainer, 'tc')
    .then(v => {
      tcAvailable = v;
    })
    .catch(() => {
      tcAvailable = undefined;
    });
});

async function installTc(): Promise<void> {
  if (!selectedContainer) return;
  try {
    installing = true;
    errorMessage = '';
    await chaosClient.installContainerTool(selectedContainer, 'tc');
    tcAvailable = true;
  } catch (err) {
    errorMessage = `Failed to install tc: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    installing = false;
  }
}

async function applyRule(): Promise<void> {
  if (!selectedContainer) return;
  try {
    errorMessage = '';
    const dnsBlock = dnsBlockInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    await chaosClient.applyNetworkRule({
      containerId: selectedContainer,
      latencyMs,
      packetLossPercent,
      bandwidthKbps,
      dnsBlock: dnsBlock.length > 0 ? dnsBlock : undefined,
    });
    await refresh();
  } catch (err) {
    errorMessage = `Failed to apply network rule: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function removeRule(containerId: string): Promise<void> {
  try {
    errorMessage = '';
    await chaosClient.removeNetworkRule(containerId);
    await refresh();
  } catch (err) {
    errorMessage = `Failed to remove network rule: ${err instanceof Error ? err.message : String(err)}`;
  }
}

onMount(() => {
  refresh();
});
</script>

<NavPage title="Network Shaper" searchEnabled={false}>
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

        {#if selectedContainer && tcAvailable === false}
          <div
            class="flex items-center justify-between rounded-lg bg-[var(--pd-status-starting)] text-[var(--pd-status-contrast)] p-3 text-sm">
            <span>Container is missing <strong>tc</strong> (iproute2), required for network shaping.</span>
            <Button type="secondary" onclick={installTc} disabled={installing}>
              {installing ? 'Installing...' : 'Install tc'}
            </Button>
          </div>
        {/if}

        <div class="grid grid-cols-3 gap-6">
          <div>
            <span class="block text-xs text-[var(--pd-content-text)] mb-2">Latency (ms)</span>
            <NumberInput
              bind:value={latencyMs}
              minimum={0}
              maximum={5000}
              step={50}
              type="integer"
              aria-label="Latency ms" />
          </div>
          <div>
            <span class="block text-xs text-[var(--pd-content-text)] mb-2">Packet Loss (%)</span>
            <NumberInput
              bind:value={packetLossPercent}
              minimum={0}
              maximum={100}
              step={1}
              type="integer"
              aria-label="Packet loss percent" />
          </div>
          <div>
            <span class="block text-xs text-[var(--pd-content-text)] mb-2">Bandwidth (kbps)</span>
            <NumberInput
              bind:value={bandwidthKbps}
              minimum={10}
              maximum={100000}
              step={100}
              type="integer"
              aria-label="Bandwidth kbps" />
          </div>
        </div>

        <div>
          <span class="block text-xs text-[var(--pd-content-text)] mb-1">DNS Block (comma-separated)</span>
          <Input bind:value={dnsBlockInput} placeholder="api.example.com, cdn.example.com" aria-label="DNS block" />
        </div>

        <Button type="primary" onclick={applyRule} icon={faNetworkWired}>Apply Network Rule</Button>
      </div>

      {#if Object.keys(activeRules).length > 0}
        <div>
          <h2 class="text-sm font-semibold text-[var(--pd-content-header)] mb-3">Active Rules</h2>
          <div class="space-y-2">
            {#each Object.entries(activeRules) as [containerId, rule]}
              <div
                class="flex items-center justify-between rounded-lg bg-[var(--pd-content-card-bg)] hover:bg-[var(--pd-content-card-hover-bg)] p-4 transition-colors">
                <div class="text-sm text-[var(--pd-content-text)]">
                  <span class="font-medium text-[var(--pd-content-header)]">
                    {containers.find(c => c.id === containerId)?.name ?? containerId.substring(0, 12)}
                  </span>
                  <span class="ml-3 space-x-3 opacity-70">
                    <Tooltip tip="Added latency" bottom>
                      <span>{rule.latencyMs ?? 0}ms latency</span>
                    </Tooltip>
                    <Tooltip tip="Packet loss rate" bottom>
                      <span>{rule.packetLossPercent ?? 0}% loss</span>
                    </Tooltip>
                    <Tooltip tip="Bandwidth limit" bottom>
                      <span>{rule.bandwidthKbps ?? 0} kbps</span>
                    </Tooltip>
                  </span>
                </div>
                <Button type="danger" onclick={removeRule.bind(undefined, containerId)}>Remove</Button>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/snippet}
</NavPage>
