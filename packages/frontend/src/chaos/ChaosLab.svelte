<script lang="ts">
import { Button, NavPage, EmptyScreen, StatusIcon, Spinner, Tooltip, ErrorMessage } from '@podman-desktop/ui-svelte';
import { faBolt, faCubes } from '@fortawesome/free-solid-svg-icons';
import { router } from 'tinro';
import { onMount } from 'svelte';
import { chaosClient } from '../api/client';
import type { ChaosState, ContainerHealth } from '/@shared/src/ChaosApi';

let chaosState: ChaosState | undefined = $state(undefined);
let containers: ContainerHealth[] = $state([]);
let loading = $state(true);
let errorMessage = $state('');
let actionInProgress = $state(false);

async function refresh(): Promise<void> {
  try {
    chaosState = await chaosClient.getChaosState();
    containers = await chaosClient.getContainerHealth();
  } catch (err) {
    console.error('Failed to fetch chaos state:', err);
  } finally {
    loading = false;
  }
}

async function stopAll(): Promise<void> {
  if (actionInProgress) return;
  try {
    actionInProgress = true;
    errorMessage = '';
    await chaosClient.stopAllChaos();
    await refresh();
  } catch (err) {
    errorMessage = `Stop all failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    actionInProgress = false;
  }
}

function containerStatus(c: ContainerHealth): string {
  if (c.isolated) return 'DEGRADED';
  if (c.state === 'running') return 'RUNNING';
  if (c.state === 'paused') return 'STARTING';
  return 'STOPPED';
}

function formatBytes(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = mb * 1024;
  if (kb >= 1) return `${kb.toFixed(1)} KB`;
  return `${(mb * 1024 * 1024).toFixed(0)} B`;
}

onMount(() => {
  refresh();
  const interval = setInterval(refresh, 2000);
  return () => clearInterval(interval);
});
</script>

<NavPage title="Chaos Lab Dashboard" searchEnabled={false}>
  {#snippet additionalActions()}
    <div class="flex items-center gap-3">
      {#if chaosState}
        <Tooltip
          tip={chaosState.runningAttacks > 0 ? `${chaosState.runningAttacks} active operations` : 'No active chaos'}
          bottom>
          <span
            class="px-3 py-1 rounded-full text-xs font-medium text-[var(--pd-status-contrast)]"
            class:bg-[var(--pd-status-running)]={chaosState.runningAttacks === 0}
            class:bg-[var(--pd-status-degraded)]={chaosState.runningAttacks > 0}>
            {chaosState.runningAttacks > 0 ? `${chaosState.runningAttacks} ACTIVE` : 'IDLE'}
          </span>
        </Tooltip>
      {/if}
      {#if chaosState && chaosState.runningAttacks > 0}
        <Button type="danger" onclick={stopAll} icon={faBolt} disabled={actionInProgress}>Stop All Chaos</Button>
      {/if}
    </div>
  {/snippet}

  {#snippet content()}
    <div class="flex flex-col w-full h-full p-5 gap-4">
      {#if errorMessage}
        <ErrorMessage error={errorMessage} />
      {/if}
      {#if loading}
        <div class="flex-1 flex items-center justify-center">
          <Spinner size="3em" />
        </div>
      {:else if containers.length === 0}
        <EmptyScreen
          icon={faCubes}
          title="No containers running"
          message="Start some containers to begin chaos engineering experiments." />
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-auto">
          {#each containers as container}
            <button
              class="rounded-lg bg-[var(--pd-content-card-bg)] hover:bg-[var(--pd-content-card-hover-bg)] p-4 transition-colors text-left cursor-pointer w-full"
              onclick={() => router.goto(`/chaos/container/${container.id}`)}>
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <StatusIcon status={containerStatus(container)} />
                  <Tooltip tip={container.name} bottom>
                    <span class="font-medium text-[var(--pd-content-header)] truncate max-w-[160px]">
                      {container.name}
                    </span>
                  </Tooltip>
                </div>
                {#if container.isolated}
                  <span
                    class="px-2 py-0.5 rounded text-xs font-medium text-[var(--pd-status-contrast)] bg-[var(--pd-status-starting)]">
                    {container.isolationMode}
                  </span>
                {/if}
              </div>
              <div class="text-xs text-[var(--pd-content-text)] mb-3 truncate" title={container.image}>
                {container.image}
              </div>
              {#if container.stats}
                <div class="space-y-2">
                  <div class="flex items-center gap-2 text-xs text-[var(--pd-content-text)]">
                    <span class="w-8 shrink-0">CPU</span>
                    <div class="flex-1 h-1.5 rounded-full bg-[var(--pd-input-field-bg)] overflow-hidden">
                      <div
                        class="h-full rounded-full bg-[var(--pd-button-primary-bg)] transition-all"
                        style="width: {Math.min(container.stats.cpuPercent, 100)}%">
                      </div>
                    </div>
                    <span class="w-10 text-right">{container.stats.cpuPercent.toFixed(1)}%</span>
                  </div>
                  <div class="flex items-center gap-2 text-xs text-[var(--pd-content-text)]">
                    <span class="w-8 shrink-0">RAM</span>
                    <div class="flex-1 h-1.5 rounded-full bg-[var(--pd-input-field-bg)] overflow-hidden">
                      <div
                        class="h-full rounded-full bg-[var(--pd-button-secondary-bg)] transition-all"
                        style="width: {Math.min(
                          (container.stats.memoryUsageMb / container.stats.memoryLimitMb) * 100,
                          100,
                        )}%">
                      </div>
                    </div>
                    <span class="w-24 text-right truncate"
                      >{formatBytes(container.stats.memoryUsageMb)} / {formatBytes(
                        container.stats.memoryLimitMb,
                      )}</span>
                  </div>
                  <div class="flex justify-between text-xs text-[var(--pd-content-text)]">
                    <span>Net I/O</span>
                    <span>{formatBytes(container.stats.netRxMb)} / {formatBytes(container.stats.netTxMb)}</span>
                  </div>
                  <div class="flex justify-between text-xs text-[var(--pd-content-text)]">
                    <span>Block I/O</span>
                    <span
                      >{formatBytes(container.stats.blockReadMb)} / {formatBytes(container.stats.blockWriteMb)}</span>
                  </div>
                </div>
              {/if}
              {#if container.activeAttacks.length > 0}
                <div class="mt-3 flex flex-wrap gap-1">
                  {#each container.activeAttacks as attack}
                    <Tooltip tip="{attack.type} attack active" bottom>
                      <span
                        class="px-2 py-0.5 rounded text-xs font-medium text-[var(--pd-status-contrast)] bg-[var(--pd-status-degraded)]">
                        {attack.type}
                      </span>
                    </Tooltip>
                  {/each}
                </div>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/snippet}
</NavPage>
