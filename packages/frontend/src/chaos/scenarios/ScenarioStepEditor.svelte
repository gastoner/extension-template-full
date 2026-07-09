<script lang="ts">
import { Button, Checkbox, Dropdown } from '@podman-desktop/ui-svelte';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import SliderNumberInput from '../../lib/SliderNumberInput.svelte';
import { attackOptions } from './scenario-table';
import type { StepForm } from './scenario-table';
import type { ContainerHealth } from '../../../../shared/src/ChaosApi';

interface Props {
  step: StepForm;
  index: number;
  removable: boolean;
  runningContainers: ContainerHealth[];
  onremove: () => void;
}

let { step = $bindable(), index, removable, runningContainers, onremove }: Props = $props();

function toggleTarget(containerId: string): void {
  if (step.targetContainerIds.includes(containerId)) {
    step.targetContainerIds = step.targetContainerIds.filter(t => t !== containerId);
  } else {
    step.targetContainerIds = [...step.targetContainerIds, containerId];
  }
}
</script>

<div class="rounded-md bg-[var(--pd-content-card-bg)] border border-[var(--pd-status-degraded)] p-2.5 space-y-2.5">
  <div class="flex items-center justify-between">
    <span class="text-xs font-medium text-[var(--pd-content-header)]">Step {index + 1}</span>
    {#if removable}
      <Button type="danger" onclick={onremove} icon={faTrash} title="Remove step" />
    {/if}
  </div>

  <div class="grid grid-cols-2 gap-3">
    <div>
      <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]">Attack Type</span>
      <Dropdown bind:value={step.attackType} options={attackOptions} ariaLabel="Attack type" />
    </div>
    <div>
      <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]">Delay before step (sec)</span>
      <SliderNumberInput bind:value={step.delaySec} minimum={0} maximum={3600} step={1} label="Delay seconds" />
    </div>
  </div>

  <Checkbox bind:checked={step.overrideTargets} title="Override scenario targets for this step">
    {#snippet children()}<span class="text-xs text-[var(--pd-content-text)]"
        >Target specific containers (override scenario targets)</span
      >{/snippet}
  </Checkbox>

  {#if step.overrideTargets}
    <div class="pl-4 border-l-2 border-[var(--pd-input-field-stroke)]">
      {#if runningContainers.length === 0}
        <p class="text-xs text-[var(--pd-content-text)] opacity-50">No running containers available.</p>
      {:else}
        <div class="space-y-1 max-h-32 overflow-auto">
          {#each runningContainers as c}
            <Checkbox
              checked={step.targetContainerIds.includes(c.id)}
              onclick={() => toggleTarget(c.id)}
              title={c.name}>
              {#snippet children()}<span class="text-xs text-[var(--pd-content-text)]">{c.name}</span>{/snippet}
            </Checkbox>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if step.attackType === 'network-shape'}
    <div class="grid grid-cols-3 gap-3">
      <div>
        <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]">Latency (ms)</span>
        <SliderNumberInput bind:value={step.latencyMs} minimum={0} maximum={5000} step={50} label="Latency ms" />
      </div>
      <div>
        <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]">Packet Loss (%)</span>
        <SliderNumberInput bind:value={step.packetLossPercent} minimum={0} maximum={100} step={1} label="Packet loss" />
      </div>
      <div>
        <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]">Bandwidth (kbps)</span>
        <SliderNumberInput bind:value={step.bandwidthKbps} minimum={10} maximum={100000} step={100} label="Bandwidth" />
      </div>
    </div>
  {/if}

  {#if step.attackType === 'resource-limit'}
    <div class="grid grid-cols-2 gap-3">
      <div>
        <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]"
          >CPU Cores ({(step.cpuPercent / 100).toFixed(2)} cores)</span>
        <SliderNumberInput bind:value={step.cpuPercent} minimum={1} maximum={1600} step={1} label="CPU percent" />
      </div>
      <div>
        <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]">Memory (MB)</span>
        <SliderNumberInput bind:value={step.memoryMb} minimum={16} maximum={8192} step={16} label="Memory MB" />
      </div>
    </div>
  {/if}
</div>
