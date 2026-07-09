<script lang="ts">
import { Button, Dropdown, ErrorMessage, Tooltip, Expandable } from '@podman-desktop/ui-svelte';
import { faFire } from '@fortawesome/free-solid-svg-icons';
import * as chaos from '../stores/chaos-store.svelte';
import SliderNumberInput from '../lib/SliderNumberInput.svelte';
import { getExpanded, setExpanded } from '../lib/expandable-state.svelte';
import type { ContainerHealth, StressInjection, StressType } from '../../../shared/src/ChaosApi';

let containers: ContainerHealth[] = $derived(await chaos.getContainerHealth());
let activeInjections: StressInjection[] = $derived(await chaos.listStressInjections());

let selectedContainer = $state('');
let stressType: StressType = $state('cpu');
let workers = $state(1);
let targetMb = $state(64);
let errorMessage = $state('');

let runningContainers = $derived(containers.filter(c => c.state === 'running'));
let containerOptions = $derived(
  runningContainers.length > 0
    ? runningContainers.map(c => ({ value: c.id, label: c.name }))
    : [{ value: '', label: 'No running containers' }],
);
let noRunning = $derived(runningContainers.length === 0);

const stressTypeOptions = [
  { value: 'cpu', label: 'CPU Burn' },
  { value: 'memory', label: 'Memory Pressure' },
  { value: 'memory-oom', label: 'OOM Bomb' },
  { value: 'log-flood', label: 'Log Flood' },
];

const stressDescriptions: Record<string, string> = {
  cpu: 'Spawns busy-loop processes inside the container that consume 100% of a CPU core each. Use workers to control how many cores to saturate.',
  memory:
    'Allocates a block of memory inside the container by reading from /dev/urandom. Use target MB to control how much memory to consume.',
  'memory-oom':
    'Progressively fills all available memory until the container hits the OOM limit and gets killed by the kernel. This simulates an out-of-memory crash.',
  'log-flood':
    'Spawns a process that continuously writes fake error messages to stdout, flooding the container logs and potentially filling disk.',
};

async function inject(): Promise<void> {
  if (!selectedContainer) return;
  try {
    errorMessage = '';
    await chaos.injectStress(selectedContainer, stressType, workers, targetMb);
  } catch (err) {
    errorMessage = `Failed to inject stress: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function stopStress(containerId: string): Promise<void> {
  try {
    errorMessage = '';
    await chaos.stopStress(containerId);
  } catch (err) {
    errorMessage = `Failed to stop stress: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function formatElapsed(startedAt: number): string {
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}
</script>

<div class="flex flex-col w-full h-full">
  <div class="flex flex-col w-full h-full pt-4">
    <div class="flex flex-row w-full px-5 pb-2">
      <Expandable expanded={getExpanded('stress-injector')} onclick={val => setExpanded('stress-injector', val)}>
        {#snippet title()}<div class="text-xl font-bold capitalize text-[var(--pd-content-header)]">
            Stress Injector
          </div>{/snippet}
        <div class="flex flex-col gap-2 text-sm text-[var(--pd-content-text)]">
          <p>
            Inject stress processes into a running container via <code
              class="text-xs bg-[var(--pd-input-field-bg)] px-1 rounded">podman exec -d</code
            >. Unlike resource limits (which cap usage), stress injection <em>generates</em> actual load to test how your
            application behaves under pressure.
          </p>
          <ul class="list-disc pl-5 space-y-1">
            <li>
              <strong>CPU Burn</strong> — Spawns busy-loop processes that consume 100% of a CPU core each. Use workers to
              control how many cores to saturate.
            </li>
            <li>
              <strong>Memory Pressure</strong> — Allocates a block of memory inside the container. Use target MB to control
              how much memory to consume.
            </li>
            <li>
              <strong>Log Flood</strong> — Continuously writes fake error messages to stdout, flooding container logs and
              potentially filling disk.
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
                ariaLabel="Target container" />
            </div>

            <div>
              <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]">Stress Type</span>
              <Dropdown bind:value={stressType} options={stressTypeOptions} ariaLabel="Stress type" />
              <p class="mt-2 text-xs text-[var(--pd-content-text)] opacity-70">
                {stressDescriptions[stressType]}
              </p>
            </div>

            {#if stressType === 'cpu'}
              <div class="w-1/2">
                <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]"
                  >Workers (parallel loops)</span>
                <SliderNumberInput bind:value={workers} minimum={1} maximum={16} step={1} label="Workers" />
              </div>
            {/if}
            {#if stressType === 'memory'}
              <div class="w-1/2">
                <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]">Target (MB)</span>
                <SliderNumberInput bind:value={targetMb} minimum={16} maximum={4096} step={16} label="Target MB" />
              </div>
            {/if}

            <Button type="danger" class="w-full" onclick={inject} icon={faFire}>Inject Stress</Button>

            {#if activeInjections.length > 0}
              <div class="pt-4">
                <h2 class="text-xl pt-2 grow mb-3">Active Injections</h2>
                <div class="space-y-1.5">
                  {#each activeInjections as injection}
                    <div
                      class="flex items-center justify-between rounded-lg bg-[var(--pd-content-card-hover-bg)] border border-[var(--pd-status-degraded)] p-2.5 transition-colors">
                      <div class="flex items-center gap-4 text-sm">
                        <span class="font-medium text-[var(--pd-content-header)]">
                          {injection.containerName}
                        </span>
                        <Tooltip tip="Stress type" bottom>
                          <span
                            class="px-2 py-0.5 rounded text-xs text-[var(--pd-status-contrast)] bg-[var(--pd-status-degraded)]">
                            {injection.type}
                          </span>
                        </Tooltip>
                        <span class="text-xs text-[var(--pd-content-text)]">
                          {formatElapsed(injection.startedAt)}
                        </span>
                      </div>
                      <Button type="secondary" onclick={stopStress.bind(undefined, injection.containerId)}>Stop</Button>
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
