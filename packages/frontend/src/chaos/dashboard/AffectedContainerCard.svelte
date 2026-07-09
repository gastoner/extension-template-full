<script lang="ts">
import { Button, StatusIcon, Tooltip, ProgressBar } from '@podman-desktop/ui-svelte';
import { goto } from '$app/navigation';
import type { AffectedContainerState, ContainerHealth } from '../../../../shared/src/ChaosApi';

interface Props {
  entry: AffectedContainerState;
  health: ContainerHealth | undefined;
  onrevert: () => void;
}

let { entry, health, onrevert }: Props = $props();

let cpuPercent = $derived(health?.stats?.cpuPercent ?? 0);
let cpuLimitPercent = $derived(health?.stats?.cpuLimitPercent ?? 0);
let cpuBarPercent = $derived(cpuLimitPercent > 0 ? (cpuPercent / cpuLimitPercent) * 100 : cpuPercent);

let memUsageMb = $derived(health?.stats?.memoryUsageMb ?? 0);
let memLimitMb = $derived(health?.stats?.memoryLimitMb ?? 0);
let memBarPercent = $derived(memLimitMb > 0 ? (memUsageMb / memLimitMb) * 100 : 0);

let netTotalMb = $derived((health?.stats?.netRxMb ?? 0) + (health?.stats?.netTxMb ?? 0));
let netBarPercent = $derived(ioPercent(netTotalMb));

let diskTotalMb = $derived((health?.stats?.blockReadMb ?? 0) + (health?.stats?.blockWriteMb ?? 0));
let diskBarPercent = $derived(ioPercent(diskTotalMb));

/** Log-scale percentage for I/O metrics that have no natural upper limit. */
function ioPercent(totalMb: number): number {
  if (totalMb <= 0) return 0;
  // 1MB→~8%, 10MB→~26%, 100MB→~50%, 1GB→~75%, 10GB→100%
  return Math.min((Math.log10(totalMb + 1) / 4) * 100, 100);
}

function navigateToContainer(): void {
  goto(`/chaos/container/${entry.containerId}`);
}

function handleRevert(event?: MouseEvent): void {
  // Button's onclick prop is typed as () => void, but Svelte still forwards the
  // native MouseEvent at runtime — stop it from bubbling up to the card's onclick.
  event?.stopPropagation();
  onrevert();
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

<button
  class="rounded-lg bg-[var(--pd-content-card-hover-bg)] p-2 transition-colors border border-[var(--pd-status-degraded)] cursor-pointer"
  tabindex="0"
  onclick={navigateToContainer}>
  <div class="flex items-center justify-between mb-1">
    <div class="flex items-center gap-1.5 min-w-0">
      <StatusIcon status={health ? containerStatus(health) : 'STOPPED'} />
      <span class="font-medium text-xs text-[var(--pd-content-header)] truncate max-w-[140px]">
        {entry.containerName}
      </span>
    </div>
    <div class="flex items-center gap-1 flex-shrink-0">
      {#if health?.isolated}
        <span
          class="px-1 py-0.5 rounded text-xs font-medium text-[var(--pd-status-contrast)] bg-[var(--pd-status-starting)]">
          {health.isolationMode}
        </span>
      {/if}
      <div class="flex items-center gap-1">
        {#if entry.activeAttacks.length <= 2}
          {#each entry.activeAttacks as attack}
            <span
              class="px-1 py-0.5 rounded text-xs font-medium text-[var(--pd-status-contrast)] bg-[var(--pd-status-degraded)]">
              {attack}
            </span>
          {/each}
        {:else}
          <Tooltip tip={entry.activeAttacks.join(', ')} bottom>
            <span
              class="px-1 py-0.5 rounded text-xs font-medium text-[var(--pd-status-contrast)] bg-[var(--pd-status-degraded)]">
              {entry.activeAttacks.length} attacks
            </span>
          </Tooltip>
        {/if}
      </div>
    </div>
  </div>

  {#if health?.image}
    <div class="text-xs text-[var(--pd-content-text)] mb-1 truncate opacity-70" title={health.image}>
      {health.image}
    </div>
  {/if}

  {#if health?.stats}
    <div class="flex flex-col gap-0.5 text-xs">
      <Tooltip
        tip="{cpuPercent.toFixed(1)}% used{cpuLimitPercent > 0 ? ` / ${cpuLimitPercent.toFixed(0)}% limit` : ''}"
        bottom>
        <div class="flex items-center gap-1.5">
          <span class="w-7 text-right text-xs text-[var(--pd-content-text)]">CPU</span>
          <ProgressBar
            progress={Math.min(cpuBarPercent, 100)}
            width="w-full"
            height="h-1"
            class="items-center flex-1"
            aria-label="CPU usage" />
        </div>
      </Tooltip>
      <Tooltip tip="{formatBytes(memUsageMb)} / {formatBytes(memLimitMb)} limit" bottom>
        <div class="flex items-center gap-1.5">
          <span class="w-7 text-right text-xs text-[var(--pd-content-text)]">Mem</span>
          <ProgressBar
            progress={Math.min(memBarPercent, 100)}
            width="w-full"
            height="h-1"
            class="items-center flex-1"
            aria-label="Memory usage" />
        </div>
      </Tooltip>
      <Tooltip tip="{formatBytes(health.stats.netRxMb)} rx / {formatBytes(health.stats.netTxMb)} tx" bottom>
        <div class="flex items-center gap-1.5">
          <span class="w-7 text-right text-xs text-[var(--pd-content-text)]">Net</span>
          <ProgressBar
            progress={netBarPercent}
            width="w-full"
            height="h-1"
            class="items-center flex-1"
            aria-label="Network I/O" />
        </div>
      </Tooltip>
      <Tooltip
        tip="{formatBytes(health.stats.blockReadMb)} read / {formatBytes(health.stats.blockWriteMb)} write"
        bottom>
        <div class="flex items-center gap-1.5">
          <span class="w-7 text-right text-xs text-[var(--pd-content-text)]">Disk</span>
          <ProgressBar
            progress={diskBarPercent}
            width="w-full"
            height="h-1"
            class="items-center flex-1"
            aria-label="Disk I/O" />
        </div>
      </Tooltip>
    </div>
  {/if}

  <div class="flex justify-end mt-1">
    <Button type="secondary" onclick={handleRevert}>Revert</Button>
  </div>
</button>
