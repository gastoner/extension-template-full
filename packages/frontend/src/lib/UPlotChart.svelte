<script lang="ts">
import { onMount } from 'svelte';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface Props {
  title: string;
  data: uPlot.AlignedData;
  series: uPlot.Series[];
  axes?: uPlot.Axis[];
  height?: number;
  yFormatter?: (val: number) => string;
}

let { title, data, series, axes, height = 200, yFormatter }: Props = $props();

let containerEl: HTMLDivElement;
let chart: uPlot | undefined = $state(undefined);

function getComputedColor(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#888';
}

function buildOpts(): uPlot.Options {
  const gridColor = getComputedColor('--pd-content-divider') || 'rgba(128,128,128,0.15)';
  const textColor = getComputedColor('--pd-content-text') || '#aaa';

  return {
    width: containerEl?.clientWidth ?? 400,
    height,
    cursor: { show: true, drag: { x: false, y: false } },
    legend: { show: true },
    axes: axes ?? [
      {
        stroke: textColor,
        grid: { stroke: gridColor, width: 1 },
        ticks: { stroke: gridColor, width: 1 },
        values: (_u: uPlot, vals: number[]) => vals.map(v => {
          const d = new Date(v * 1000);
          return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
        }),
      },
      {
        stroke: textColor,
        grid: { stroke: gridColor, width: 1 },
        ticks: { stroke: gridColor, width: 1 },
        size: 60,
        ...(yFormatter ? { values: (_u: uPlot, vals: number[]) => vals.map(yFormatter) } : {}),
      },
    ],
    series: [{ }, ...series],
  };
}

function handleResize(): void {
  if (chart && containerEl) {
    chart.setSize({ width: containerEl.clientWidth, height });
  }
}

$effect(() => {
  if (chart && data && data[0]?.length) {
    chart.setData(data);
  }
});

onMount(() => {
  if (containerEl) {
    chart = new uPlot(buildOpts(), data, containerEl);
  }
  window.addEventListener('resize', handleResize);
  return () => {
    chart?.destroy();
    window.removeEventListener('resize', handleResize);
  };
});
</script>

<div class="flex flex-col gap-1">
  <span class="text-xs font-semibold text-[var(--pd-content-header)]">{title}</span>
  <div bind:this={containerEl} class="w-full"></div>
</div>
