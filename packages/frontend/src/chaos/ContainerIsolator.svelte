<script lang="ts">
import {
  Button,
  NavPage,
  Dropdown,
  StatusIcon,
  Checkbox,
  Tooltip,
  NumberInput,
  ErrorMessage,
} from '@podman-desktop/ui-svelte';
import { faBan } from '@fortawesome/free-solid-svg-icons';
import { onMount } from 'svelte';
import { chaosClient } from '../api/client';
import type { ContainerHealth, IsolationRule } from '/@shared/src/ChaosApi';

let containers: ContainerHealth[] = $state([]);
let isolations: IsolationRule[] = $state([]);
let selectedContainer = $state('');
let isolationMode: string = $state('pause');
let autoRestoreSec = $state(0);
let networks: string[] = $state([]);
let selectedNetworks: string[] = $state([]);
let peerContainers: string[] = $state([]);
let errorMessage = $state('');
let iptablesAvailable: boolean | undefined = $state(undefined);
let installing = $state(false);

const modeOptions = [
  { value: 'pause', label: 'Pause (Freeze)' },
  { value: 'network-disconnect', label: 'Network Disconnect' },
  { value: 'network-partition', label: 'Network Partition' },
];

async function refresh(): Promise<void> {
  try {
    containers = await chaosClient.getContainerHealth();
    isolations = await chaosClient.listIsolations();
  } catch (err) {
    errorMessage = `Failed to load data: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function loadNetworks(): Promise<void> {
  try {
    if (selectedContainer) {
      networks = await chaosClient.getContainerNetworks(selectedContainer);
      selectedNetworks = [...networks];
    } else {
      networks = [];
      selectedNetworks = [];
    }
  } catch (err) {
    errorMessage = `Failed to load networks: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function checkIptables(): Promise<void> {
  if (!selectedContainer) {
    iptablesAvailable = undefined;
    return;
  }
  try {
    iptablesAvailable = await chaosClient.checkContainerTool(selectedContainer, 'iptables');
  } catch {
    iptablesAvailable = undefined;
  }
}

async function installIptables(): Promise<void> {
  if (!selectedContainer) return;
  try {
    installing = true;
    errorMessage = '';
    await chaosClient.installContainerTool(selectedContainer, 'iptables');
    iptablesAvailable = true;
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

    await chaosClient.isolateContainer(rule);
    await refresh();
  } catch (err) {
    errorMessage = `Failed to isolate container: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function restore(containerId: string): Promise<void> {
  try {
    errorMessage = '';
    await chaosClient.restoreContainer(containerId);
    await refresh();
  } catch (err) {
    errorMessage = `Failed to restore container: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function restoreAll(): Promise<void> {
  try {
    errorMessage = '';
    for (const iso of isolations) {
      await chaosClient.restoreContainer(iso.containerId);
    }
    await refresh();
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

function containerStatus(c: ContainerHealth): string {
  if (c.isolated) return 'DEGRADED';
  if (c.state === 'running') return 'RUNNING';
  return 'STOPPED';
}

function getElapsedDisplay(startedAt: number): string {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
}

onMount(() => {
  refresh();
  const interval = setInterval(refresh, 3000);
  return () => clearInterval(interval);
});
</script>

<NavPage title="Container Isolator" searchEnabled={false}>
  {#snippet content()}
    <div class="flex flex-col w-full h-full p-5 gap-4">
      {#if errorMessage}
        <ErrorMessage error={errorMessage} />
      {/if}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 overflow-auto">
        <!-- Column 1: Container List -->
        <div class="rounded-lg bg-[var(--pd-content-card-bg)] p-4">
          <h2 class="text-sm font-semibold text-[var(--pd-content-header)] mb-3">Containers</h2>
          <div class="space-y-1 max-h-80 overflow-auto">
            {#each containers.filter(c => c.state === 'running') as c}
              <button
                class="w-full text-left p-2 rounded-md text-sm flex items-center gap-2 transition-colors"
                class:bg-[var(--pd-secondary-nav-selected-bg)]={selectedContainer === c.id}
                class:text-[color:var(--pd-secondary-nav-text-selected)]={selectedContainer === c.id}
                class:text-[color:var(--pd-content-text)]={selectedContainer !== c.id}
                class:hover:bg-[var(--pd-content-card-hover-bg)]={selectedContainer !== c.id}
                onclick={() => {
                  selectedContainer = c.id;
                  loadNetworks();
                  checkIptables();
                }}>
                <StatusIcon status={containerStatus(c)} />
                <span class="truncate">{c.name}</span>
                {#if c.isolated}
                  <span class="text-[10px] opacity-60 ml-auto">{c.isolationMode}</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- Column 2: Isolation Config -->
        <div class="rounded-lg bg-[var(--pd-content-card-bg)] p-4 space-y-4">
          <h2 class="text-sm font-semibold text-[var(--pd-content-header)]">Isolation Mode</h2>

          <Dropdown bind:value={isolationMode} options={modeOptions} ariaLabel="Isolation mode" />

          {#if isolationMode === 'pause'}
            <p class="text-xs text-[var(--pd-content-text)] opacity-60">
              Freezes all processes inside the container. Other services will see connection timeouts.
            </p>
          {:else if isolationMode === 'network-disconnect'}
            <div>
              <span class="block text-xs text-[var(--pd-content-text)] mb-2">Disconnect from networks:</span>
              {#if networks.length === 0}
                <p class="text-xs text-[var(--pd-content-text)] opacity-50">Select a container first</p>
              {:else}
                {#each networks as network}
                  <Checkbox
                    checked={selectedNetworks.includes(network)}
                    onclick={() => toggleNetwork(network)}
                    title={network}>
                    {#snippet children()}<span class="text-sm text-[var(--pd-content-text)]">{network}</span>{/snippet}
                  </Checkbox>
                {/each}
              {/if}
            </div>
          {:else if isolationMode === 'network-partition'}
            <div>
              {#if selectedContainer && iptablesAvailable === false}
                <div
                  class="flex items-center justify-between rounded-lg bg-[var(--pd-status-starting)] text-[var(--pd-status-contrast)] p-3 text-sm mb-3">
                  <span>Container is missing <strong>iptables</strong>, required for network partition.</span>
                  <Button type="secondary" onclick={installIptables} disabled={installing}>
                    {installing ? 'Installing...' : 'Install iptables'}
                  </Button>
                </div>
              {/if}
              <span class="block text-xs text-[var(--pd-content-text)] mb-2">Block traffic to peers:</span>
              {#each containers.filter(c => c.state === 'running' && c.id !== selectedContainer) as peer}
                <Checkbox
                  checked={peerContainers.includes(peer.id)}
                  onclick={() => togglePeer(peer.id)}
                  title={peer.name}>
                  {#snippet children()}<span class="text-sm text-[var(--pd-content-text)]">{peer.name}</span>{/snippet}
                </Checkbox>
              {/each}
            </div>
          {/if}

          <div>
            <span class="block text-xs text-[var(--pd-content-text)] mb-1">Auto-restore after (sec, 0 = manual)</span>
            <NumberInput
              bind:value={autoRestoreSec}
              minimum={0}
              maximum={3600}
              step={10}
              type="integer"
              aria-label="Auto-restore seconds" />
          </div>

          <Button type="primary" onclick={isolate} icon={faBan}>Isolate Container</Button>
        </div>

        <!-- Column 3: Active Isolations -->
        <div class="rounded-lg bg-[var(--pd-content-card-bg)] p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-[var(--pd-content-header)]">Active Isolations</h2>
            {#if isolations.length > 0}
              <Button type="danger" onclick={restoreAll}>Restore All</Button>
            {/if}
          </div>
          {#if isolations.length === 0}
            <p class="text-xs text-[var(--pd-content-text)] opacity-50">No containers are currently isolated.</p>
          {:else}
            <div class="space-y-2">
              {#each isolations as iso}
                <div
                  class="rounded-md border-l-4 border-[var(--pd-status-starting)] bg-[var(--pd-content-card-hover-bg)] p-3">
                  <div class="flex items-center justify-between mb-1">
                    <span class="font-medium text-sm text-[var(--pd-content-header)]">{iso.containerName}</span>
                    <Button type="secondary" onclick={restore.bind(undefined, iso.containerId)}>Restore</Button>
                  </div>
                  <div class="text-xs text-[var(--pd-content-text)] opacity-70 space-x-2">
                    <Tooltip tip="Isolation type" bottom>
                      <span
                        class="px-1.5 py-0.5 rounded text-[var(--pd-status-contrast)] bg-[var(--pd-status-starting)]">
                        {iso.mode}
                      </span>
                    </Tooltip>
                    <span>Running: {getElapsedDisplay(iso.startedAt)}</span>
                    {#if iso.autoRestoreAfterSec}
                      <span>Auto-restore in {iso.autoRestoreAfterSec}s</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/snippet}
</NavPage>
