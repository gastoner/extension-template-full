<script lang="ts">
import { Button, Dropdown, Input, Checkbox } from '@podman-desktop/ui-svelte';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import SliderNumberInput from '../../lib/SliderNumberInput.svelte';
import ScenarioStepEditor from './ScenarioStepEditor.svelte';
import { createDefaultStep, strategyOptions } from './scenario-table';
import type { StepForm } from './scenario-table';
import type { ContainerHealth, ScenarioStep, AttackType } from '../../../../shared/src/ChaosApi';
import * as chaos from '../../stores/chaos-store.svelte';

interface Props {
  containers: ContainerHealth[];
  oncancel: () => void;
  oncreated: () => void;
  onerror: (msg: string) => void;
}

let { containers, oncancel, oncreated, onerror }: Props = $props();

let newName = $state('');
let newInterval = $state(30);
let newStrategy: string = $state('random');
let selectedTargetIds: string[] = $state([]);
let steps: StepForm[] = $state([createDefaultStep()]);

let runningContainers = $derived(containers.filter(c => c.state === 'running'));

function toggleTarget(id: string): void {
  if (selectedTargetIds.includes(id)) {
    selectedTargetIds = selectedTargetIds.filter(t => t !== id);
  } else {
    selectedTargetIds = [...selectedTargetIds, id];
  }
}

function addStep(): void {
  steps = [...steps, createDefaultStep()];
}

function removeStep(index: number): void {
  steps = steps.filter((_, i) => i !== index);
}

function toScenarioSteps(forms: StepForm[]): ScenarioStep[] {
  return forms.map(f => {
    const step: ScenarioStep = { attackType: f.attackType as AttackType };
    if (f.delaySec > 0) step.delaySec = f.delaySec;
    if (f.overrideTargets && f.targetContainerIds.length > 0) {
      step.targetContainerIds = [...f.targetContainerIds];
    }
    if (f.attackType === 'network-shape') {
      step.latencyMs = f.latencyMs;
      step.packetLossPercent = f.packetLossPercent;
      step.bandwidthKbps = f.bandwidthKbps;
    }
    if (f.attackType === 'resource-limit') {
      step.cpuPercent = f.cpuPercent;
      step.memoryMb = f.memoryMb;
    }
    return step;
  });
}

async function submit(): Promise<void> {
  try {
    const plainSteps = toScenarioSteps($state.snapshot(steps));
    const plainTargetIds: string[] = $state.snapshot(selectedTargetIds);

    await chaos.createScenario({
      id: '',
      name: newName || 'Unnamed Scenario',
      intervalSec: newInterval,
      targetStrategy: newStrategy as 'random' | 'specific' | 'all',
      targetIds: newStrategy === 'specific' ? plainTargetIds : undefined,
      steps: plainSteps,
      enabled: false,
    });

    newName = '';
    newInterval = 30;
    selectedTargetIds = [];
    steps = [createDefaultStep()];
    oncreated();
  } catch (err) {
    onerror(`Failed to create scenario: ${err instanceof Error ? err.message : String(err)}`);
  }
}
</script>

<div class="mx-5 mb-4 rounded-lg bg-[var(--pd-content-card-hover-bg)] p-5 space-y-4">
  <h3 class="text-sm font-semibold text-[var(--pd-content-header)]">Create Scenario</h3>

  <div>
    <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]">Scenario Name</span>
    <Input bind:value={newName} placeholder="My Chaos Scenario" aria-label="Scenario name" />
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div>
      <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]">Interval (sec)</span>
      <SliderNumberInput bind:value={newInterval} minimum={5} maximum={3600} step={5} label="Interval seconds" />
    </div>
    <div>
      <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]">Target Strategy</span>
      <Dropdown bind:value={newStrategy} options={strategyOptions} ariaLabel="Target strategy" />
    </div>
  </div>

  {#if newStrategy === 'specific'}
    <div>
      <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]">Target Containers</span>
      {#if runningContainers.length === 0}
        <p class="text-xs text-[var(--pd-content-text)] opacity-50">No running containers available.</p>
      {:else}
        <div class="space-y-1 max-h-40 overflow-auto">
          {#each runningContainers as c}
            <Checkbox checked={selectedTargetIds.includes(c.id)} onclick={() => toggleTarget(c.id)} title={c.name}>
              {#snippet children()}<span class="text-sm text-[var(--pd-content-text)]">{c.name}</span>{/snippet}
            </Checkbox>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <div>
    <div class="flex items-center justify-between mb-2">
      <span class="text-xs font-semibold text-[var(--pd-content-header)] uppercase">Steps</span>
      <Button type="secondary" onclick={addStep} icon={faPlus}>Add Step</Button>
    </div>
    <div class="space-y-1.5">
      {#each steps as step, i}
        <ScenarioStepEditor
          bind:step={steps[i]}
          index={i}
          removable={steps.length > 1}
          runningContainers={runningContainers}
          onremove={() => removeStep(i)} />
      {/each}
    </div>
  </div>

  <div class="flex flex-row space-x-4">
    <Button type="secondary" class="w-full" onclick={oncancel}>Cancel</Button>
    <Button class="w-full" onclick={submit}>Create Scenario</Button>
  </div>
</div>
