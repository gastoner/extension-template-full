<script lang="ts">
import { Button, Dropdown, Tooltip, Input, Checkbox, ErrorMessage, Expandable } from '@podman-desktop/ui-svelte';
import { faPlus, faTrash, faPlay } from '@fortawesome/free-solid-svg-icons';
import * as chaos from '../api/chaos-store.svelte';
import SliderNumberInput from '../lib/SliderNumberInput.svelte';
import { getExpanded, setExpanded } from '../lib/expandable-state.svelte';
import type { Scenario, ContainerHealth, ScenarioStep, AttackType } from '/@shared/src/ChaosApi';

let scenarios: Scenario[] = $derived(await chaos.listScenarios());
let containers: ContainerHealth[] = $derived(await chaos.getContainerHealth());
let showForm = $state(false);
let errorMessage = $state('');

let newName = $state('');
let newInterval = $state(30);
let newStrategy: string = $state('random');
let selectedTargetIds: string[] = $state([]);

interface StepForm {
  attackType: string;
  delaySec: number;
  overrideTargets: boolean;
  targetContainerIds: string[];
  latencyMs: number;
  packetLossPercent: number;
  bandwidthKbps: number;
  cpuPercent: number;
  memoryMb: number;
}

function createDefaultStep(): StepForm {
  return {
    attackType: 'stop',
    delaySec: 0,
    overrideTargets: false,
    targetContainerIds: [],
    latencyMs: 100,
    packetLossPercent: 5,
    bandwidthKbps: 1000,
    cpuPercent: 50,
    memoryMb: 64,
  };
}

let steps: StepForm[] = $state([createDefaultStep()]);

const strategyOptions = [
  { value: 'random', label: 'Random' },
  { value: 'all', label: 'All Containers' },
  { value: 'specific', label: 'Specific' },
];

const attackOptions: { value: string; label: string }[] = [
  { value: 'stop', label: 'Stop' },
  { value: 'kill', label: 'Kill' },
  { value: 'pause', label: 'Pause' },
  { value: 'restart', label: 'Restart' },
  { value: 'network-shape', label: 'Network Shaping' },
  { value: 'resource-limit', label: 'Resource Limit' },
  { value: 'network-disconnect', label: 'Network Disconnect' },
  { value: 'stress', label: 'Stress (CPU)' },
  { value: 'config-sabotage', label: 'Config Sabotage (DNS)' },
];

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

function toggleStepTarget(step: StepForm, containerId: string): void {
  if (step.targetContainerIds.includes(containerId)) {
    step.targetContainerIds = step.targetContainerIds.filter(t => t !== containerId);
  } else {
    step.targetContainerIds = [...step.targetContainerIds, containerId];
  }
}

function resolveContainerName(id: string): string {
  return containers.find(c => c.id === id)?.name ?? id.substring(0, 12);
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

function stepSummary(step: ScenarioStep): string {
  const label = attackOptions.find(o => o.value === step.attackType)?.label ?? step.attackType;
  const parts = [label];
  if (step.targetContainerIds?.length) {
    const names = step.targetContainerIds.map(id => resolveContainerName(id));
    parts.push(`→ ${names.join(', ')}`);
  }
  if (step.delaySec && step.delaySec > 0) parts.push(`delay ${step.delaySec}s`);
  if (step.attackType === 'network-shape') {
    if (step.latencyMs) parts.push(`${step.latencyMs}ms`);
    if (step.packetLossPercent) parts.push(`${step.packetLossPercent}% loss`);
    if (step.bandwidthKbps) parts.push(`${step.bandwidthKbps}kbps`);
  }
  if (step.attackType === 'resource-limit') {
    if (step.cpuPercent) parts.push(`CPU ${(step.cpuPercent / 100).toFixed(2)} cores`);
    if (step.memoryMb) parts.push(`${step.memoryMb}MB RAM`);
  }
  return parts.join(', ');
}

async function addScenario(): Promise<void> {
  try {
    errorMessage = '';
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
    showForm = false;
  } catch (err) {
    errorMessage = `Failed to create scenario: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function deleteScenario(id: string): Promise<void> {
  try {
    errorMessage = '';
    await chaos.deleteScenario(id);
  } catch (err) {
    errorMessage = `Failed to delete scenario: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function toggleScenario(id: string, enabled: boolean): Promise<void> {
  try {
    errorMessage = '';
    await chaos.toggleScenario(id, !enabled);
  } catch (err) {
    errorMessage = `Failed to toggle scenario: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function runOnce(id: string): Promise<void> {
  try {
    errorMessage = '';
    await chaos.runScenarioOnce(id);
  } catch (err) {
    errorMessage = `Failed to run scenario: ${err instanceof Error ? err.message : String(err)}`;
  }
}
</script>

<div class="flex flex-col w-full h-full">
  <div class="flex flex-col w-full h-full pt-4">
    <div class="flex flex-row w-full px-5 pb-2">
      <Expandable expanded={getExpanded('scenarios')} onclick={val => setExpanded('scenarios', val)}>
        {#snippet title()}
          <div class="flex flex-row w-full items-center">
            <div class="text-xl font-bold capitalize text-[var(--pd-content-header)]">Chaos Scenarios</div>
            <div class="flex grow justify-end">
              <Button
                type={showForm ? 'secondary' : 'primary'}
                onclick={() => {
                  showForm = !showForm;
                }}
                icon={showForm ? undefined : faPlus}>
                {showForm ? 'Cancel' : 'New Scenario'}
              </Button>
            </div>
          </div>
        {/snippet}
        <div class="flex flex-col gap-2 text-sm text-[var(--pd-content-text)]">
          <p>
            Create repeating chaos attack sequences that run on an interval. Each scenario can target random, specific,
            or all running containers.
          </p>
          <ul class="list-disc pl-5 space-y-1">
            <li><strong>Stop / Kill</strong> — Gracefully stops or force-kills the container process.</li>
            <li><strong>Pause</strong> — Freezes all processes without stopping the container.</li>
            <li><strong>Restart</strong> — Stops then starts the container.</li>
            <li><strong>Network Shaping</strong> — Applies latency, packet loss, and bandwidth limits.</li>
            <li><strong>Resource Limit</strong> — Caps CPU and memory usage.</li>
            <li><strong>Network Disconnect</strong> — Disconnects the container from its networks.</li>
          </ul>
          <p>
            Scenarios can have multiple steps with optional delays between them, and each step can override the
            scenario's target strategy.
          </p>
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

            {#if showForm}
              <div class="rounded-lg bg-[var(--pd-content-card-hover-bg)] p-5 space-y-4">
                <h3 class="text-sm font-semibold text-[var(--pd-content-header)]">Create Scenario</h3>
                <div>
                  <span class="block text-xs text-[var(--pd-content-text)] mb-1">Scenario Name</span>
                  <Input bind:value={newName} placeholder="My Chaos Scenario" aria-label="Scenario name" />
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <span class="block text-xs text-[var(--pd-content-text)] mb-1">Interval (sec)</span>
                    <SliderNumberInput
                      bind:value={newInterval}
                      minimum={5}
                      maximum={3600}
                      step={5}
                      label="Interval seconds" />
                  </div>
                  <div>
                    <span class="block text-xs text-[var(--pd-content-text)] mb-1">Target Strategy</span>
                    <Dropdown bind:value={newStrategy} options={strategyOptions} ariaLabel="Target strategy" />
                  </div>
                </div>
                {#if newStrategy === 'specific'}
                  <div>
                    <span class="block text-xs text-[var(--pd-content-text)] mb-2">Target Containers</span>
                    {#if runningContainers.length === 0}
                      <p class="text-xs text-[var(--pd-content-text)] opacity-50">No running containers available.</p>
                    {:else}
                      <div class="space-y-1 max-h-40 overflow-auto">
                        {#each runningContainers as c}
                          <Checkbox
                            checked={selectedTargetIds.includes(c.id)}
                            onclick={() => toggleTarget(c.id)}
                            title={c.name}>
                            {#snippet children()}<span class="text-sm text-[var(--pd-content-text)]">{c.name}</span
                              >{/snippet}
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
                  <div class="space-y-3">
                    {#each steps as step, i}
                      <div class="rounded-md bg-[var(--pd-content-card-bg)] p-3 space-y-3">
                        <div class="flex items-center justify-between">
                          <span class="text-xs font-medium text-[var(--pd-content-header)]">Step {i + 1}</span>
                          {#if steps.length > 1}
                            <Button
                              type="danger"
                              onclick={removeStep.bind(undefined, i)}
                              icon={faTrash}
                              title="Remove step" />
                          {/if}
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                          <div>
                            <span class="block text-xs text-[var(--pd-content-text)] mb-1">Attack Type</span>
                            <Dropdown bind:value={step.attackType} options={attackOptions} ariaLabel="Attack type" />
                          </div>
                          <div>
                            <span class="block text-xs text-[var(--pd-content-text)] mb-1"
                              >Delay before step (sec)</span>
                            <SliderNumberInput
                              bind:value={step.delaySec}
                              minimum={0}
                              maximum={3600}
                              step={1}
                              label="Delay seconds" />
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
                              <p class="text-xs text-[var(--pd-content-text)] opacity-50">
                                No running containers available.
                              </p>
                            {:else}
                              <div class="space-y-1 max-h-32 overflow-auto">
                                {#each runningContainers as c}
                                  <Checkbox
                                    checked={step.targetContainerIds.includes(c.id)}
                                    onclick={() => toggleStepTarget(step, c.id)}
                                    title={c.name}>
                                    {#snippet children()}<span class="text-xs text-[var(--pd-content-text)]"
                                        >{c.name}</span
                                      >{/snippet}
                                  </Checkbox>
                                {/each}
                              </div>
                            {/if}
                          </div>
                        {/if}

                        {#if step.attackType === 'network-shape'}
                          <div class="grid grid-cols-3 gap-3">
                            <div>
                              <span class="block text-xs text-[var(--pd-content-text)] mb-1">Latency (ms)</span>
                              <SliderNumberInput
                                bind:value={step.latencyMs}
                                minimum={0}
                                maximum={5000}
                                step={50}
                                label="Latency ms" />
                            </div>
                            <div>
                              <span class="block text-xs text-[var(--pd-content-text)] mb-1">Packet Loss (%)</span>
                              <SliderNumberInput
                                bind:value={step.packetLossPercent}
                                minimum={0}
                                maximum={100}
                                step={1}
                                label="Packet loss" />
                            </div>
                            <div>
                              <span class="block text-xs text-[var(--pd-content-text)] mb-1">Bandwidth (kbps)</span>
                              <SliderNumberInput
                                bind:value={step.bandwidthKbps}
                                minimum={10}
                                maximum={100000}
                                step={100}
                                label="Bandwidth" />
                            </div>
                          </div>
                        {/if}

                        {#if step.attackType === 'resource-limit'}
                          <div class="grid grid-cols-2 gap-3">
                            <div>
                              <span class="block text-xs text-[var(--pd-content-text)] mb-1"
                                >CPU Cores ({(step.cpuPercent / 100).toFixed(2)} cores)</span>
                              <SliderNumberInput
                                bind:value={step.cpuPercent}
                                minimum={1}
                                maximum={1600}
                                step={1}
                                label="CPU percent" />
                            </div>
                            <div>
                              <span class="block text-xs text-[var(--pd-content-text)] mb-1">Memory (MB)</span>
                              <SliderNumberInput
                                bind:value={step.memoryMb}
                                minimum={16}
                                maximum={8192}
                                step={16}
                                label="Memory MB" />
                            </div>
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>

                <div class="w-full flex flex-row space-x-4 pt-4 border-t-2 border-[var(--pd-content-divider)]">
                  <Button
                    type="secondary"
                    class="w-full"
                    onclick={() => {
                      showForm = false;
                    }}>Cancel</Button>
                  <Button class="w-full" onclick={addScenario}>Create Scenario</Button>
                </div>
              </div>
            {/if}

            {#if scenarios.length === 0 && !showForm}
              <div class="flex-1 flex items-center justify-center text-[var(--pd-content-text)] opacity-60 py-12">
                No scenarios configured yet. Click "New Scenario" to create one.
              </div>
            {:else if scenarios.length > 0}
              <div class="overflow-auto rounded-lg">
                <div class="w-full" role="table" aria-label="scenarios">
                  <div role="rowgroup">
                    <div
                      class="grid grid-cols-6 gap-x-2 h-8 text-[var(--pd-table-header-text)] uppercase text-xs font-semibold items-center px-3"
                      role="row">
                      <div role="columnheader">Name</div>
                      <div role="columnheader">Interval</div>
                      <div role="columnheader">Strategy</div>
                      <div role="columnheader">Steps</div>
                      <div role="columnheader">Status</div>
                      <div role="columnheader" class="text-right">Actions</div>
                    </div>
                  </div>
                  <div role="rowgroup" class="space-y-2">
                    {#each scenarios as scenario}
                      <div
                        class="grid grid-cols-6 gap-x-2 min-h-[48px] items-center px-3 rounded-lg bg-[var(--pd-content-card-hover-bg)] transition-colors"
                        role="row"
                        aria-label={scenario.name}>
                        <div class="text-[var(--pd-content-header)] font-medium text-sm" role="cell">
                          {scenario.name}
                        </div>
                        <div class="text-[var(--pd-content-text)] text-sm" role="cell">{scenario.intervalSec}s</div>
                        <div class="text-[var(--pd-content-text)] text-sm" role="cell">{scenario.targetStrategy}</div>
                        <div class="text-[var(--pd-content-text)] text-sm flex flex-wrap gap-1" role="cell">
                          {#each scenario.steps as step, i}
                            <Tooltip tip={stepSummary(step)} bottom>
                              <span
                                class="px-1.5 py-0.5 rounded text-xs text-[var(--pd-status-contrast)] bg-[var(--pd-button-secondary-bg)]">
                                {i + 1}. {attackOptions.find(o => o.value === step.attackType)?.label ??
                                  step.attackType}
                              </span>
                            </Tooltip>
                          {/each}
                        </div>
                        <div role="cell">
                          <Tooltip tip={scenario.enabled ? 'Click to disable' : 'Click to enable'} bottom>
                            <button
                              class="px-2 py-0.5 rounded text-xs font-medium text-[var(--pd-status-contrast)]"
                              class:bg-[var(--pd-status-running)]={scenario.enabled}
                              class:bg-[var(--pd-status-not-running)]={!scenario.enabled}
                              onclick={toggleScenario.bind(undefined, scenario.id, scenario.enabled)}>
                              {scenario.enabled ? 'Enabled' : 'Disabled'}
                            </button>
                          </Tooltip>
                        </div>
                        <div class="text-right flex justify-end gap-2" role="cell">
                          <Button
                            type="secondary"
                            onclick={runOnce.bind(undefined, scenario.id)}
                            icon={faPlay}
                            title="Run scenario once">
                            Run
                          </Button>
                          <Button
                            type="danger"
                            onclick={deleteScenario.bind(undefined, scenario.id)}
                            icon={faTrash}
                            title="Delete scenario">
                            Delete
                          </Button>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
