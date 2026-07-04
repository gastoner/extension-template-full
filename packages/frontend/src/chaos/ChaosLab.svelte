<script lang="ts">
import { Button, EmptyScreen, StatusIcon, Tooltip, ErrorMessage, Expandable } from '@podman-desktop/ui-svelte';
import { faBolt, faSkull } from '@fortawesome/free-solid-svg-icons';
import { goto } from '$app/navigation';
import * as chaos from '../api/chaos-store.svelte';
import { getExpanded, setExpanded } from '../lib/expandable-state.svelte';
import type { ChaosState, ContainerHealth } from '/@shared/src/ChaosApi';

let chaosState: ChaosState | undefined = $derived(await chaos.getChaosState());
let containers: ContainerHealth[] = $derived(await chaos.getContainerHealth());
let errorMessage = $state('');
let actionInProgress = $state(false);

let affectedContainers = $derived(
  containers.filter(c => c.activeAttacks.length > 0 || c.isolated),
);

async function stopAll(): Promise<void> {
  if (actionInProgress) return;
  try {
    actionInProgress = true;
    errorMessage = '';
    await chaos.stopAllChaos();
  } catch (err) {
    errorMessage = `Stop all failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    actionInProgress = false;
  }
}

async function toggleChaosMode(): Promise<void> {
  if (actionInProgress) return;
  try {
    actionInProgress = true;
    errorMessage = '';
    if (chaosState?.chaosModeActive) {
      await chaos.disableChaosMode();
    } else {
      await chaos.enableChaosMode(30);
    }
  } catch (err) {
    errorMessage = `Chaos mode toggle failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    actionInProgress = false;
  }
}

async function startQuickChaos(): Promise<void> {
  if (actionInProgress) return;
  const running = containers.filter(c => c.state === 'running');
  if (running.length === 0) return;
  const target = running[Math.floor(Math.random() * running.length)];
  try {
    actionInProgress = true;
    errorMessage = '';
    await chaos.isolateContainer({
      containerId: target.id,
      containerName: target.name,
      mode: 'pause',
      autoRestoreAfterSec: 30,
      startedAt: Date.now(),
    });
  } catch (err) {
    errorMessage = `Quick chaos failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    actionInProgress = false;
  }
}

async function action(event: MouseEvent, fn: () => Promise<void>): Promise<void> {
  event.stopPropagation();
  try {
    errorMessage = '';
    await fn();
  } catch (err) {
    errorMessage = `Action failed: ${err instanceof Error ? err.message : String(err)}`;
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
</script>

<div class="flex flex-col w-full h-full">
  <div class="flex flex-col w-full h-full pt-4">
    <div class="flex flex-row w-full px-5 pb-2 items-center">
      <Expandable expanded={getExpanded('chaos-lab')} onclick={val => setExpanded('chaos-lab', val)}>
        {#snippet title()}
          <div class="flex flex-row w-full items-center">
            <div class="text-xl font-bold capitalize text-[var(--pd-content-header)]">Chaos Lab Dashboard</div>
            <div class="flex grow justify-end items-center gap-3">
              {#if chaosState}
                {#if chaosState.killCount > 0}
                  <Tooltip tip="{chaosState.killCount} containers killed this session" bottom>
                    <span class="px-3 py-1 rounded-full text-xs font-medium text-[var(--pd-status-contrast)] bg-[var(--pd-status-stopped)]">
                      {chaosState.killCount} KILLED
                    </span>
                  </Tooltip>
                {/if}
                <Tooltip tip={chaosState.runningAttacks > 0 ? `${chaosState.runningAttacks} active operations` : 'No active chaos'} bottom>
                  <span class="px-3 py-1 rounded-full text-xs font-medium text-[var(--pd-status-contrast)]"
                    class:bg-[var(--pd-status-running)]={chaosState.runningAttacks === 0}
                    class:bg-[var(--pd-status-degraded)]={chaosState.runningAttacks > 0}>
                    {chaosState.runningAttacks > 0 ? `${chaosState.runningAttacks} ACTIVE` : 'IDLE'}
                  </span>
                </Tooltip>
              {/if}
              {#if chaosState && chaosState.runningAttacks > 0}
                <Button type="danger" onclick={stopAll} icon={faBolt} disabled={actionInProgress}>
                  Stop All Chaos
                </Button>
              {/if}
            </div>
          </div>
        {/snippet}
        <div class="flex flex-col gap-2 text-sm text-[var(--pd-content-text)]">
          <p>Monitor containers affected by chaos operations. Only containers with active attacks or isolations are shown here.</p>
          <p>Use the chaos mode toggle below to randomly kill containers, or click "Start making chaos" to begin.</p>
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

            <div class="flex items-center gap-4 rounded-lg bg-[var(--pd-content-card-hover-bg)] p-4">
              <button
                class="relative inline-flex h-7 w-14 items-center rounded-full transition-colors cursor-pointer"
                class:bg-[var(--pd-status-degraded)]={chaosState?.chaosModeActive}
                class:bg-[var(--pd-input-field-bg)]={!chaosState?.chaosModeActive}
                onclick={toggleChaosMode}
                disabled={actionInProgress}
                aria-label="Toggle Chaos Mode">
                <span
                  class="inline-block h-5 w-5 rounded-full bg-white transition-transform"
                  class:translate-x-8={chaosState?.chaosModeActive}
                  class:translate-x-1={!chaosState?.chaosModeActive}>
                </span>
              </button>
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-[var(--pd-content-header)]">
                  CHAOS MODE
                </span>
                {#if chaosState?.chaosModeActive}
                  <span class="px-2 py-0.5 rounded text-xs font-bold text-[var(--pd-status-contrast)] bg-[var(--pd-status-degraded)] animate-pulse">
                    ACTIVE
                  </span>
                  <span class="text-xs text-[var(--pd-content-text)]">Killing a random container every 30s</span>
                {:else}
                  <span class="text-xs text-[var(--pd-content-text)]">Random container killer (disabled)</span>
                {/if}
              </div>
            </div>

            {#if affectedContainers.length === 0}
              <EmptyScreen
                icon={faSkull}
                title="No chaos in progress"
                message="All containers are running peacefully. Start some chaos to see affected containers here.">
                {#snippet upperContent()}
                  <div>
                    <span class="text-[var(--pd-details-empty-sub-header)] max-w-[800px] text-pretty mx-2">
                      Pause a random running container for 30 seconds:
                    </span>
                    <div class="flex gap-2 justify-center p-3">
                      <Button
                        title="Pause a random container for 30 seconds"
                        type="primary"
                        inProgress={actionInProgress}
                        onclick={startQuickChaos}>Start making chaos</Button>
                    </div>
                  </div>
                {/snippet}
              </EmptyScreen>
            {:else}
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {#each affectedContainers as container}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="rounded-lg bg-[var(--pd-content-card-hover-bg)] p-4 transition-colors border-2 border-[var(--pd-status-degraded)] cursor-pointer hover:brightness-110"
                    role="button"
                    tabindex="0"
                    onclick={() => goto(`/chaos/container/${container.id}`)}
                    onkeydown={e => e.key === 'Enter' && goto(`/chaos/container/${container.id}`)}>
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
                        <span class="px-2 py-0.5 rounded text-xs font-medium text-[var(--pd-status-contrast)] bg-[var(--pd-status-starting)]">
                          {container.isolationMode}
                        </span>
                      {/if}
                    </div>
                    <div class="text-xs text-[var(--pd-content-text)] mb-3 truncate" title={container.image}>
                      {container.image}
                    </div>
                    {#if container.stats}
                      {@const cpuUsedCores = container.stats.cpuPercent / 100}
                      {@const cpuLimitCores = container.stats.cpuLimitPercent / 100}
                      {@const cpuBarPercent = cpuLimitCores > 0 ? (cpuUsedCores / cpuLimitCores) * 100 : container.stats.cpuPercent}
                      <div class="space-y-2">
                        <div class="flex items-center gap-2 text-xs text-[var(--pd-content-text)]">
                          <span class="w-8 shrink-0">CPU</span>
                          <div class="flex-1 h-1.5 rounded-full bg-[var(--pd-input-field-bg)] overflow-hidden">
                            <div class="h-full rounded-full transition-all"
                              class:bg-[var(--pd-status-degraded)]={cpuBarPercent > 80}
                              class:bg-[var(--pd-button-primary-bg)]={cpuBarPercent <= 80}
                              style="width: {Math.min(cpuBarPercent, 100)}%"></div>
                          </div>
                          <span class="w-24 text-right truncate">{cpuUsedCores.toFixed(2)}{#if cpuLimitCores > 0} / {cpuLimitCores.toFixed(1)}{/if} vCPU</span>
                        </div>
                        <div class="flex items-center gap-2 text-xs text-[var(--pd-content-text)]">
                          <span class="w-8 shrink-0">RAM</span>
                          <div class="flex-1 h-1.5 rounded-full bg-[var(--pd-input-field-bg)] overflow-hidden">
                            <div class="h-full rounded-full bg-[var(--pd-button-secondary-bg)] transition-all" style="width: {Math.min((container.stats.memoryUsageMb / container.stats.memoryLimitMb) * 100, 100)}%"></div>
                          </div>
                          <span class="w-24 text-right truncate">{formatBytes(container.stats.memoryUsageMb)} / {formatBytes(container.stats.memoryLimitMb)}</span>
                        </div>
                        <div class="flex justify-between text-xs text-[var(--pd-content-text)]">
                          <span>Net I/O</span>
                          <span>{formatBytes(container.stats.netRxMb)} / {formatBytes(container.stats.netTxMb)}</span>
                        </div>
                        <div class="flex justify-between text-xs text-[var(--pd-content-text)]">
                          <span>Block I/O</span>
                          <span>{formatBytes(container.stats.blockReadMb)} / {formatBytes(container.stats.blockWriteMb)}</span>
                        </div>
                      </div>
                    {/if}
                    {#if container.activeAttacks.length > 0}
                      <div class="mt-3 flex flex-wrap gap-1">
                        {#each container.activeAttacks as attack}
                          <Tooltip tip="{attack.type} attack active" bottom>
                            <span class="px-2 py-0.5 rounded text-xs font-medium text-[var(--pd-status-contrast)] bg-[var(--pd-status-degraded)]">
                              {attack.type}
                            </span>
                          </Tooltip>
                        {/each}
                      </div>
                    {/if}
                    <div class="mt-3 flex flex-wrap gap-2 border-t border-[var(--pd-input-field-bg)] pt-3">
                      {#if container.isolated}
                        <Button type="secondary" onclick={(e: MouseEvent) => action(e, () => chaos.restoreContainer(container.id))}>Restore</Button>
                      {/if}
                      {#if chaosState?.stressInjections[container.id]}
                        <Button type="secondary" onclick={(e: MouseEvent) => action(e, () => chaos.stopStress(container.id))}>Stop Stress</Button>
                      {/if}
                      {#if chaosState?.networkRules[container.id]}
                        <Button type="secondary" onclick={(e: MouseEvent) => action(e, () => chaos.removeNetworkRule(container.id))}>Remove Net Rule</Button>
                      {/if}
                      {#if chaosState?.resourceLimits[container.id]}
                        <Button type="secondary" onclick={(e: MouseEvent) => action(e, () => chaos.removeResourceLimit(container.id))}>Remove Limit</Button>
                      {/if}
                      {#if chaosState?.configSabotages[container.id]}
                        <Button type="secondary" onclick={(e: MouseEvent) => action(e, () => chaos.restoreConfig(container.id))}>Restore Config</Button>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
