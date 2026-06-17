<script lang="ts">
import { DetailsPage, StatusIcon, Spinner, Tooltip } from '@podman-desktop/ui-svelte';
import { router } from 'tinro';
import { onMount } from 'svelte';
import { chaosClient } from '../api/client';
import type { ContainerHealth } from '/@shared/src/ChaosApi';
import type { ContainerStats } from '/@shared/src/ContainerTypes';
import UPlotChart from '../lib/UPlotChart.svelte';
import type uPlot from 'uplot';

const MAX_POINTS = 600;

interface Props {
  containerId: string;
}

let { containerId }: Props = $props();

let container: ContainerHealth | undefined = $state(undefined);
let dataPoints: ContainerStats[] = $state([]);
let latestStats: ContainerStats | undefined = $state(undefined);
let loading = $state(true);
let lastTimestamp = 0;

function getComputedColor(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#888';
}

function containerStatus(c: ContainerHealth): string {
  if (c.isolated) return 'DEGRADED';
  if (c.state === 'running') return 'RUNNING';
  if (c.state === 'paused') return 'STARTING';
  return 'STOPPED';
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = mb * 1024;
  if (kb >= 1) return `${kb.toFixed(1)} KB`;
  return `${(mb * 1024 * 1024).toFixed(0)} B`;
}

let hasCpuLimit: boolean = $derived(dataPoints.some(p => p.cpuLimitPercent > 0));

let cpuData: uPlot.AlignedData = $derived.by(() => {
  if (!dataPoints.length) return hasCpuLimit ? [[], [], []] : [[], []];
  const ts = dataPoints.map(p => p.timestamp / 1000);
  const cpu = dataPoints.map(p => p.cpuPercent);
  if (hasCpuLimit) {
    return [ts, cpu, dataPoints.map(p => p.cpuLimitPercent)];
  }
  return [ts, cpu];
});

let memData: uPlot.AlignedData = $derived.by(() => {
  if (!dataPoints.length) return [[], [], []];
  return [
    dataPoints.map(p => p.timestamp / 1000),
    dataPoints.map(p => p.memoryUsageMb),
    dataPoints.map(p => p.memoryLimitMb),
  ];
});

let netData: uPlot.AlignedData = $derived.by(() => {
  if (!dataPoints.length) return [[], [], []];
  return [dataPoints.map(p => p.timestamp / 1000), dataPoints.map(p => p.netRxMb), dataPoints.map(p => p.netTxMb)];
});

let blockData: uPlot.AlignedData = $derived.by(() => {
  if (!dataPoints.length) return [[], [], []];
  return [
    dataPoints.map(p => p.timestamp / 1000),
    dataPoints.map(p => p.blockReadMb),
    dataPoints.map(p => p.blockWriteMb),
  ];
});

let cpuSeries: uPlot.Series[] = $derived.by(() => {
  const base: uPlot.Series[] = [{ label: 'CPU %', stroke: getComputedColor('--pd-status-running'), width: 2 }];
  if (hasCpuLimit) {
    base.push({ label: 'Limit', stroke: getComputedColor('--pd-status-degraded'), width: 1, dash: [5, 5] });
  }
  return base;
});

let memSeries: uPlot.Series[] = $derived([
  {
    label: 'Usage',
    stroke: getComputedColor('--pd-button-primary-bg'),
    width: 2,
    fill: getComputedColor('--pd-button-primary-bg') + '30',
  },
  { label: 'Limit', stroke: getComputedColor('--pd-status-degraded'), width: 1, dash: [5, 5] },
]);

let netSeries: uPlot.Series[] = $derived([
  { label: 'RX', stroke: getComputedColor('--pd-button-primary-bg'), width: 2 },
  { label: 'TX', stroke: getComputedColor('--pd-button-secondary-bg'), width: 2 },
]);

let blockSeries: uPlot.Series[] = $derived([
  { label: 'Read', stroke: getComputedColor('--pd-button-primary-bg'), width: 2 },
  { label: 'Write', stroke: getComputedColor('--pd-button-tertiary-bg'), width: 2 },
]);

async function loadInitial(): Promise<void> {
  try {
    const containers = await chaosClient.getContainerHealth();
    container = containers.find(c => c.id === containerId);
    if (container?.stats) {
      latestStats = container.stats;
      lastTimestamp = container.stats.timestamp;
      dataPoints = [container.stats];
    }
  } catch (err) {
    console.error('Failed to load container detail:', err);
  } finally {
    loading = false;
  }
}

async function pollLatest(): Promise<void> {
  try {
    const containers = await chaosClient.getContainerHealth();
    container = containers.find(c => c.id === containerId);
    const newStats = container?.stats;

    if (newStats && newStats.timestamp > lastTimestamp) {
      lastTimestamp = newStats.timestamp;
      latestStats = newStats;
      const updated =
        dataPoints.length >= MAX_POINTS
          ? [...dataPoints.slice(dataPoints.length - MAX_POINTS + 1), newStats]
          : [...dataPoints, newStats];
      dataPoints = updated;
    }
  } catch (err) {
    console.error('Failed to poll container stats:', err);
  }
}

function goBack(): void {
  router.goto('/chaos');
}

onMount(() => {
  loadInitial();
  const interval = setInterval(pollLatest, 3000);
  return () => clearInterval(interval);
});
</script>

<DetailsPage
  title={container?.name ?? 'Container'}
  subtitle={container?.image}
  breadcrumbLeftPart="Dashboard"
  breadcrumbRightPart={container?.name}
  onclose={goBack}
  onbreadcrumbClick={goBack}>
  {#snippet iconSnippet()}
    {#if container}
      <StatusIcon status={containerStatus(container)} size={24} />
    {/if}
  {/snippet}

  {#snippet actionsSnippet()}
    {#if container}
      <div class="flex items-center gap-2">
        {#if container.isolated}
          <span
            class="px-2 py-0.5 rounded text-xs font-medium text-[var(--pd-status-contrast)] bg-[var(--pd-status-starting)]">
            {container.isolationMode}
          </span>
        {/if}
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
  {/snippet}

  {#snippet contentSnippet()}
    {#if loading}
      <div class="flex items-center justify-center h-full">
        <Spinner size="3em" />
      </div>
    {:else if !container}
      <div class="flex items-center justify-center h-full text-[var(--pd-content-text)] opacity-60">
        Container not found. It may have been removed.
      </div>
    {:else}
      <div class="flex flex-col gap-4 p-5 overflow-auto h-full">
        <div class="grid grid-cols-5 gap-3">
          <div class="rounded-lg bg-[var(--pd-content-card-bg)] p-3 text-center">
            <div class="text-[10px] text-[var(--pd-content-text)] uppercase">Status</div>
            <div class="text-sm font-bold text-[var(--pd-content-header)]">{container.state}</div>
          </div>
          {#if latestStats}
            <div class="rounded-lg bg-[var(--pd-content-card-bg)] p-3 text-center">
              <div class="text-[10px] text-[var(--pd-content-text)] uppercase">CPU</div>
              <div class="text-sm font-bold text-[var(--pd-content-header)]">
                {latestStats.cpuPercent.toFixed(1)}%{#if latestStats.cpuLimitPercent > 0}
                  / {latestStats.cpuLimitPercent.toFixed(0)}%{/if}
              </div>
            </div>
            <div class="rounded-lg bg-[var(--pd-content-card-bg)] p-3 text-center">
              <div class="text-[10px] text-[var(--pd-content-text)] uppercase">Memory</div>
              <div class="text-sm font-bold text-[var(--pd-content-header)]">
                {formatMb(latestStats.memoryUsageMb)} / {formatMb(latestStats.memoryLimitMb)}
              </div>
            </div>
            <div class="rounded-lg bg-[var(--pd-content-card-bg)] p-3 text-center">
              <div class="text-[10px] text-[var(--pd-content-text)] uppercase">Net I/O</div>
              <div class="text-sm font-bold text-[var(--pd-content-header)]">
                {formatMb(latestStats.netRxMb)} / {formatMb(latestStats.netTxMb)}
              </div>
            </div>
            <div class="rounded-lg bg-[var(--pd-content-card-bg)] p-3 text-center">
              <div class="text-[10px] text-[var(--pd-content-text)] uppercase">Block I/O</div>
              <div class="text-sm font-bold text-[var(--pd-content-header)]">
                {formatMb(latestStats.blockReadMb)} / {formatMb(latestStats.blockWriteMb)}
              </div>
            </div>
          {/if}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="rounded-lg bg-[var(--pd-content-card-bg)] p-4">
            <UPlotChart title="CPU Usage" data={cpuData} series={cpuSeries} yFormatter={v => `${v.toFixed(1)}%`} />
          </div>
          <div class="rounded-lg bg-[var(--pd-content-card-bg)] p-4">
            <UPlotChart title="Memory Usage" data={memData} series={memSeries} yFormatter={formatMb} />
          </div>
          <div class="rounded-lg bg-[var(--pd-content-card-bg)] p-4">
            <UPlotChart title="Network I/O" data={netData} series={netSeries} yFormatter={formatMb} />
          </div>
          <div class="rounded-lg bg-[var(--pd-content-card-bg)] p-4">
            <UPlotChart title="Block I/O" data={blockData} series={blockSeries} yFormatter={formatMb} />
          </div>
        </div>
      </div>
    {/if}
  {/snippet}
</DetailsPage>
