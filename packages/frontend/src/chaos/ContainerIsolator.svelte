<script lang="ts">
import { Button, Dropdown, StatusIcon, Checkbox, Tooltip, ErrorMessage, Expandable } from '@podman-desktop/ui-svelte';
import { faBan } from '@fortawesome/free-solid-svg-icons';
import * as chaos from '../stores/chaos-store.svelte';
import SliderNumberInput from '../lib/SliderNumberInput.svelte';
import { getExpanded, setExpanded } from '../lib/expandable-state.svelte';
import type { ContainerHealth, IsolationRule } from '../../../shared/src/ChaosApi';

let containers: ContainerHealth[] = $derived(await chaos.getContainerHealth());
let isolations: IsolationRule[] = $derived(await chaos.listIsolations());

let selectedContainer = $state('');
let isolationMode: string = $state('pause');

let runningContainers = $derived(containers.filter(c => c.state === 'running'));
let containerOptions = $derived(
  runningContainers.length > 0
    ? runningContainers.map(c => ({ value: c.id, label: c.name }))
    : [{ value: '', label: 'No running containers' }],
);
let noRunning = $derived(runningContainers.length === 0);
let autoRestoreSec = $state(0);
let selectedNetworks: string[] = $state([]);
let peerContainers: string[] = $state([]);
let errorMessage = $state('');
let installing = $state(false);

let networks: string[] = $derived(selectedContainer ? await chaos.getContainerNetworks(selectedContainer) : []);

let iptablesAvailable: boolean | undefined = $derived(
  selectedContainer ? await chaos.checkContainerTool(selectedContainer, 'iptables') : undefined,
);

let packageManagers: string[] = $derived(
  selectedContainer && iptablesAvailable === false ? await chaos.detectPackageManagers(selectedContainer) : [],
);
let selectedPm = $state('');

$effect(() => {
  selectedNetworks = [...(networks ?? [])];
});

const modeOptions = [
  { value: 'pause', label: 'Pause (Freeze)' },
  { value: 'network-disconnect', label: 'Network Disconnect' },
  { value: 'network-partition', label: 'Network Partition' },
];

async function installIptables(): Promise<void> {
  if (!selectedContainer || !selectedPm) return;
  try {
    installing = true;
    errorMessage = '';
    await chaos.installContainerTool(selectedContainer, 'iptables', selectedPm);
  } catch (err) {
    errorMessage = `Failed to install iptables: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    installing = false;
  }
}

async function isolate(): Promise<void> {
  if (!selectedContainer) return;
  const container = containers.find(c => c.id === selectedContainer);
  if (!container) return;

  try {
    errorMessage = '';
    const rule: IsolationRule = {
      containerId: selectedContainer,
      containerName: container.name,
      mode: isolationMode as 'pause' | 'network-disconnect' | 'network-partition',
      autoRestoreAfterSec: autoRestoreSec > 0 ? autoRestoreSec : undefined,
      startedAt: Date.now(),
    };

    if (isolationMode === 'network-disconnect') {
      rule.disconnectedNetworks = [...selectedNetworks];
    } else if (isolationMode === 'network-partition') {
      rule.partitionPeers = [...peerContainers];
    }

    await chaos.isolateContainer(rule);
  } catch (err) {
    errorMessage = `Failed to isolate container: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function restore(containerId: string): Promise<void> {
  try {
    errorMessage = '';
    await chaos.restoreContainer(containerId);
  } catch (err) {
    errorMessage = `Failed to restore container: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function restoreAll(): Promise<void> {
  try {
    errorMessage = '';
    for (const iso of isolations) {
      await chaos.restoreContainer(iso.containerId);
    }
  } catch (err) {
    errorMessage = `Failed to restore all containers: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function togglePeer(id: string): void {
  if (peerContainers.includes(id)) {
    peerContainers = peerContainers.filter(p => p !== id);
  } else {
    peerContainers = [...peerContainers, id];
  }
}

function toggleNetwork(network: string): void {
  if (selectedNetworks.includes(network)) {
    selectedNetworks = selectedNetworks.filter(n => n !== network);
  } else {
    selectedNetworks = [...selectedNetworks, network];
  }
}

function getElapsedDisplay(startedAt: number): string {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
}
</script>

<div class="flex flex-col w-full h-full">
  <div class="flex flex-col w-full h-full pt-4">
    <div class="flex flex-row w-full px-5 pb-2">
      <Expandable expanded={getExpanded('container-isolator')} onclick={val => setExpanded('container-isolator', val)}>
        {#snippet title()}<div class="text-xl font-bold capitalize text-[var(--pd-content-header)]">
            Container Isolator
          </div>{/snippet}
        <div class="flex flex-col gap-2 text-sm text-[var(--pd-content-text)]">
          <p>
            Isolate containers from each other or from the network to test fault tolerance and graceful degradation.
          </p>
          <ul class="list-disc pl-5 space-y-1">
            <li>
              <strong>Pause</strong> — Freezes all processes in the container using
              <code class="text-xs bg-[var(--pd-input-field-bg)] px-1 rounded">podman pause</code>.
            </li>
            <li>
              <strong>Network Disconnect</strong> — Disconnects the container from selected networks, simulating a network
              outage.
            </li>
            <li>
              <strong>Network Partition</strong> — Blocks traffic to specific peer containers using iptables rules. Requires
              iptables inside the container.
            </li>
            <li>
              <strong>Auto-Restore</strong> — Automatically restores the container after the specified number of seconds (0
              = manual restore only).
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
              <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]">Target Container</span>
              <Dropdown
                bind:value={selectedContainer}
                options={containerOptions}
                disabled={noRunning}
                ariaLabel="Select container" />
            </div>

            {#if selectedContainer && !noRunning}
              {@const container = containers.find(c => c.id === selectedContainer)}
              {#if container?.isolated}
                <div class="flex items-center gap-2 text-xs text-[var(--pd-content-text)] opacity-70">
                  <StatusIcon status="DEGRADED" />
                  <span>Currently isolated ({container.isolationMode})</span>
                </div>
              {/if}
            {/if}

            <div>
              <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]">Isolation Mode</span>
              <Dropdown bind:value={isolationMode} options={modeOptions} ariaLabel="Isolation mode" />
            </div>

            {#if isolationMode === 'pause'}
              <p class="text-xs text-[var(--pd-content-text)] opacity-60">
                Freezes all processes inside the container. Other services will see connection timeouts.
              </p>
            {:else if isolationMode === 'network-disconnect'}
              <div>
                <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]"
                  >Disconnect from networks:</span>
                {#if networks.length === 0}
                  <p class="text-xs text-[var(--pd-content-text)] opacity-50">Select a container first</p>
                {:else}
                  {#each networks as network}
                    <Checkbox
                      checked={selectedNetworks.includes(network)}
                      onclick={() => toggleNetwork(network)}
                      title={network}>
                      {#snippet children()}<span class="text-sm text-[var(--pd-content-text)]">{network}</span
                        >{/snippet}
                    </Checkbox>
                  {/each}
                {/if}
              </div>
            {:else if isolationMode === 'network-partition'}
              <div>
                {#if selectedContainer && iptablesAvailable === false}
                  <div
                    class="flex items-center justify-between rounded-lg bg-[var(--pd-status-starting)] text-[var(--pd-status-contrast)] p-3 text-sm mb-3">
                    <span>Container is missing <strong>iptables</strong>.</span>
                    <div class="flex items-center gap-2">
                      {#if packageManagers.length > 0}
                        <Dropdown
                          bind:value={selectedPm}
                          options={packageManagers.map(pm => ({ value: pm, label: pm }))}
                          ariaLabel="Package manager" />
                      {/if}
                      <Button type="secondary" onclick={installIptables} disabled={installing || !selectedPm}>
                        {installing ? 'Installing...' : 'Install iptables'}
                      </Button>
                    </div>
                  </div>
                {/if}
                <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]"
                  >Block traffic to peers:</span>
                {#each containers.filter(c => c.state === 'running' && c.id !== selectedContainer) as peer}
                  <Checkbox
                    checked={peerContainers.includes(peer.id)}
                    onclick={() => togglePeer(peer.id)}
                    title={peer.name}>
                    {#snippet children()}<span class="text-sm text-[var(--pd-content-text)]">{peer.name}</span
                      >{/snippet}
                  </Checkbox>
                {/each}
              </div>
            {/if}

            <div class="w-1/2">
              <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]"
                >Auto-restore after (sec, 0 = manual)</span>
              <SliderNumberInput
                bind:value={autoRestoreSec}
                minimum={0}
                maximum={3600}
                step={10}
                label="Auto-restore seconds" />
            </div>

            <Button class="w-full" onclick={isolate} icon={faBan}>Isolate Container</Button>

            {#if isolations.length > 0}
              <div class="pt-4">
                <div class="flex items-center justify-between mb-3">
                  <h2 class="text-xl pt-2 grow mb-3">Active Isolations</h2>
                  <Button type="danger" onclick={restoreAll}>Restore All</Button>
                </div>
                <div class="space-y-1.5">
                  {#each isolations as iso}
                    <div
                      class="flex items-center justify-between rounded-lg bg-[var(--pd-content-card-hover-bg)] border border-[var(--pd-status-degraded)] p-2.5 transition-colors">
                      <div class="flex items-center gap-4 text-sm">
                        <span class="font-medium text-[var(--pd-content-header)]">{iso.containerName}</span>
                        <Tooltip tip="Isolation type" bottom>
                          <span
                            class="px-2 py-0.5 rounded text-xs text-[var(--pd-status-contrast)] bg-[var(--pd-status-starting)]">
                            {iso.mode}
                          </span>
                        </Tooltip>
                        <span class="text-xs text-[var(--pd-content-text)]">
                          {getElapsedDisplay(iso.startedAt)}
                        </span>
                        {#if iso.autoRestoreAfterSec}
                          <span class="text-xs text-[var(--pd-content-text)]">
                            Auto-restore in {iso.autoRestoreAfterSec}s
                          </span>
                        {/if}
                      </div>
                      <Button type="secondary" onclick={restore.bind(undefined, iso.containerId)}>Restore</Button>
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
