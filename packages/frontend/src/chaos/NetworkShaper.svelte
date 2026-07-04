<script lang="ts">
import { Button, Dropdown, Tooltip, Input, ErrorMessage, Expandable } from '@podman-desktop/ui-svelte';
import { faNetworkWired } from '@fortawesome/free-solid-svg-icons';
import * as chaos from '../api/chaos-store.svelte';
import SliderNumberInput from '../lib/SliderNumberInput.svelte';
import { getExpanded, setExpanded } from '../lib/expandable-state.svelte';
import type { ChaosState, ContainerHealth, NetworkRule } from '/@shared/src/ChaosApi';

let containers: ContainerHealth[] = $derived(await chaos.getContainerHealth());
let chaosState: ChaosState | undefined = $derived(await chaos.getChaosState());
let activeRules: Record<string, NetworkRule> = $derived(chaosState?.networkRules ?? {});

let selectedContainer = $state('');
let latencyMs = $state(100);
let packetLossPercent = $state(5);
let bandwidthKbps = $state(1000);
let dnsBlockInput = $state('');
let errorMessage = $state('');
let installing = $state(false);

let tcAvailable: boolean | undefined = $derived(
  selectedContainer ? await chaos.checkContainerTool(selectedContainer, 'tc') : undefined,
);

let runningContainers = $derived(containers.filter(c => c.state === 'running'));
let containerOptions = $derived(
  runningContainers.length > 0
    ? runningContainers.map(c => ({ value: c.id, label: c.name }))
    : [{ value: '', label: 'No running containers' }],
);
let noRunning = $derived(runningContainers.length === 0);

async function installTc(): Promise<void> {
  if (!selectedContainer) return;
  try {
    installing = true;
    errorMessage = '';
    await chaos.installContainerTool(selectedContainer, 'tc');
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
    await chaos.applyNetworkRule({
      containerId: selectedContainer,
      latencyMs,
      packetLossPercent,
      bandwidthKbps,
      dnsBlock: dnsBlock.length > 0 ? dnsBlock : undefined,
    });
  } catch (err) {
    errorMessage = `Failed to apply network rule: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function removeRule(containerId: string): Promise<void> {
  try {
    errorMessage = '';
    await chaos.removeNetworkRule(containerId);
  } catch (err) {
    errorMessage = `Failed to remove network rule: ${err instanceof Error ? err.message : String(err)}`;
  }
}
</script>

<div class="flex flex-col w-full h-full">
  <div class="flex flex-col w-full h-full pt-4">
    <div class="flex flex-row w-full px-5 pb-2">
      <Expandable expanded={getExpanded('network-shaper')} onclick={val => setExpanded('network-shaper', val)}>
        {#snippet title()}<div class="text-xl font-bold capitalize text-[var(--pd-content-header)]">
            Network Shaper
          </div>{/snippet}
        <div class="flex flex-col gap-2 text-sm text-[var(--pd-content-text)]">
          <p>
            Inject network faults into a running container using <code
              class="text-xs bg-[var(--pd-input-field-bg)] px-1 rounded">tc</code> (traffic control). Requires iproute2 inside
            the container — install it with the button below if missing.
          </p>
          <ul class="list-disc pl-5 space-y-1">
            <li>
              <strong>Latency</strong> — Adds delay to every outgoing packet (e.g. 200ms simulates a distant server).
            </li>
            <li>
              <strong>Packet Loss</strong> — Randomly drops a percentage of outgoing packets (e.g. 10% simulates an unreliable
              link).
            </li>
            <li><strong>Bandwidth</strong> — Caps outgoing throughput in kbps (e.g. 100 kbps simulates 2G mobile).</li>
            <li>
              <strong>DNS Block</strong> — Redirects specified domains to 127.0.0.1 via /etc/hosts, breaking DNS resolution
              for those domains.
            </li>
          </ul>
        </div>
      </Expandable>
    </div>

    <div class="flex w-full h-full overflow-auto">
      <div class="flex min-w-full h-full justify-center">
        <div class="flex flex-col space-y-4 min-w-full overflow-y-auto">
          <div class="flex flex-col gap-4 bg-[var(--pd-content-card-bg)] grow p-5">
            {#if errorMessage}
              <ErrorMessage error={errorMessage} />
            {/if}

            <div>
              <span class="block text-xs text-[var(--pd-content-text)] mb-1">Target Container</span>
              <Dropdown
                bind:value={selectedContainer}
                options={containerOptions}
                disabled={noRunning}
                ariaLabel="Target container" />
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
                <span class="block text-xs text-[var(--pd-content-text)] mb-1">Latency (ms)</span>
                <SliderNumberInput bind:value={latencyMs} minimum={0} maximum={5000} step={50} label="Latency ms" />
              </div>
              <div>
                <span class="block text-xs text-[var(--pd-content-text)] mb-1">Packet Loss (%)</span>
                <SliderNumberInput
                  bind:value={packetLossPercent}
                  minimum={0}
                  maximum={100}
                  step={1}
                  label="Packet loss percent" />
              </div>
              <div>
                <span class="block text-xs text-[var(--pd-content-text)] mb-1">Bandwidth (kbps)</span>
                <SliderNumberInput
                  bind:value={bandwidthKbps}
                  minimum={10}
                  maximum={100000}
                  step={100}
                  label="Bandwidth kbps" />
              </div>
            </div>

            <div>
              <span class="block text-xs text-[var(--pd-content-text)] mb-1">DNS Block (comma-separated)</span>
              <Input bind:value={dnsBlockInput} placeholder="api.example.com, cdn.example.com" aria-label="DNS block" />
            </div>

            <div class="w-full flex flex-row space-x-4 pt-4 border-t-2 border-[var(--pd-content-divider)]">
              <Button class="w-full" onclick={applyRule} icon={faNetworkWired}>Apply Network Rule</Button>
            </div>

            {#if Object.keys(activeRules).length > 0}
              <div class="pt-4">
                <h2 class="text-xl pt-2 grow mb-3">Active Rules</h2>
                <div class="space-y-2">
                  {#each Object.entries(activeRules) as [containerId, rule]}
                    <div
                      class="flex items-center justify-between rounded-lg bg-[var(--pd-content-card-hover-bg)] p-4 transition-colors">
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
        </div>
      </div>
    </div>
  </div>
</div>
