<script lang="ts">
import { Button, Dropdown, Tooltip, ErrorMessage, Expandable } from '@podman-desktop/ui-svelte';
import { faTachometerAlt } from '@fortawesome/free-solid-svg-icons';
import * as chaos from '../stores/chaos-store.svelte';
import SliderNumberInput from '../lib/SliderNumberInput.svelte';
import { getExpanded, setExpanded } from '../lib/expandable-state.svelte';
import type { ChaosState, ContainerHealth, ResourceLimit } from '../../../shared/src/ChaosApi';

let containers: ContainerHealth[] = $derived(await chaos.getContainerHealth());
let chaosState: ChaosState | undefined = $derived(await chaos.getChaosState());
let activeLimits: Record<string, ResourceLimit> = $derived(chaosState?.resourceLimits ?? {});

let selectedContainer = $state('');
let cpuPercent = $state(50);
let memoryMb = $state(64);
let deviceReadBpsKB = $state(0);
let deviceWriteBpsKB = $state(0);
let errorMessage = $state('');

let runningContainers = $derived(containers.filter(c => c.state === 'running'));
let containerOptions = $derived(
  runningContainers.length > 0
    ? runningContainers.map(c => ({ value: c.id, label: c.name }))
    : [{ value: '', label: 'No running containers' }],
);
let noRunning = $derived(runningContainers.length === 0);

async function applyLimit(): Promise<void> {
  if (!selectedContainer) return;
  try {
    errorMessage = '';
    await chaos.applyResourceLimit({
      containerId: selectedContainer,
      cpuPercent,
      memoryMb,
      deviceReadBpsKB: deviceReadBpsKB > 0 ? deviceReadBpsKB : undefined,
      deviceWriteBpsKB: deviceWriteBpsKB > 0 ? deviceWriteBpsKB : undefined,
    });
  } catch (err) {
    errorMessage = `Failed to apply resource limit: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function removeLimit(containerId: string): Promise<void> {
  try {
    errorMessage = '';
    await chaos.removeResourceLimit(containerId);
  } catch (err) {
    errorMessage = `Failed to restore resource limit: ${err instanceof Error ? err.message : String(err)}`;
  }
}
</script>

<div class="flex flex-col w-full h-full">
  <div class="flex flex-col w-full h-full pt-4">
    <div class="flex flex-row w-full px-5 pb-2">
      <Expandable expanded={getExpanded('resource-limiter')} onclick={val => setExpanded('resource-limiter', val)}>
        {#snippet title()}<div class="text-xl font-bold capitalize text-[var(--pd-content-header)]">
            Resource Limiter
          </div>{/snippet}
        <div class="flex flex-col gap-2 text-sm text-[var(--pd-content-text)]">
          <p>
            Restrict CPU, memory, and disk I/O for a running container using <code
              class="text-xs bg-[var(--pd-input-field-bg)] px-1 rounded">podman update</code
            >. Original limits are saved and restored when you click Restore.
          </p>
          <ul class="list-disc pl-5 space-y-1">
            <li>
              <strong>CPU Cores Limit</strong> — Maximum CPU cores the container can use (e.g. 0.50 = half a core).
            </li>
            <li><strong>Memory Limit</strong> — Maximum memory in MB the container can allocate.</li>
            <li><strong>Disk Read/Write Limit</strong> — Throttle disk I/O speed in KB/s. Set to 0 for unlimited.</li>
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

            <div class="grid grid-cols-2 gap-6">
              <div>
                <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]"
                  >CPU Cores Limit ({(cpuPercent / 100).toFixed(2)} cores)</span>
                <SliderNumberInput bind:value={cpuPercent} minimum={1} maximum={1600} step={1} label="CPU percent" />
              </div>
              <div>
                <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]">Memory Limit (MB)</span>
                <SliderNumberInput bind:value={memoryMb} minimum={16} maximum={8192} step={16} label="Memory MB" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-6">
              <div>
                <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]"
                  >Disk Read Limit (KB/s, 0 = no limit)</span>
                <SliderNumberInput
                  bind:value={deviceReadBpsKB}
                  minimum={0}
                  maximum={102400}
                  step={64}
                  label="Disk read KB/s" />
              </div>
              <div>
                <span class="block mb-1 text-sm font-medium text-[var(--pd-content-text)]"
                  >Disk Write Limit (KB/s, 0 = no limit)</span>
                <SliderNumberInput
                  bind:value={deviceWriteBpsKB}
                  minimum={0}
                  maximum={102400}
                  step={64}
                  label="Disk write KB/s" />
              </div>
            </div>

            <Button class="w-full" onclick={applyLimit} icon={faTachometerAlt}>Apply Resource Limit</Button>

            {#if Object.keys(activeLimits).length > 0}
              <div class="pt-4">
                <h2 class="text-xl pt-2 grow mb-3">Active Limits</h2>
                <div class="space-y-1.5">
                  {#each Object.entries(activeLimits) as [containerId, limit]}
                    <div
                      class="flex items-center justify-between rounded-lg bg-[var(--pd-content-card-hover-bg)] border border-[var(--pd-status-degraded)] p-2.5 transition-colors">
                      <div class="flex items-center gap-4 text-sm flex-wrap">
                        <span class="font-medium text-[var(--pd-content-header)]">
                          {containers.find(c => c.id === containerId)?.name ?? containerId.substring(0, 12)}
                        </span>
                        <Tooltip tip="CPU cores restriction" bottom>
                          <span
                            class="px-2 py-0.5 rounded text-xs text-[var(--pd-status-contrast)] bg-[var(--pd-status-starting)]">
                            CPU: {(limit.cpuPercent / 100).toFixed(2)} cores
                          </span>
                        </Tooltip>
                        <Tooltip tip="Memory restriction" bottom>
                          <span
                            class="px-2 py-0.5 rounded text-xs text-[var(--pd-status-contrast)] bg-[var(--pd-button-primary-bg)]">
                            RAM: {limit.memoryMb} MB
                          </span>
                        </Tooltip>
                        {#if limit.deviceReadBpsKB}
                          <Tooltip tip="Disk read limit" bottom>
                            <span
                              class="px-2 py-0.5 rounded text-xs text-[var(--pd-status-contrast)] bg-[var(--pd-status-degraded)]">
                              Read: {limit.deviceReadBpsKB} KB/s
                            </span>
                          </Tooltip>
                        {/if}
                        {#if limit.deviceWriteBpsKB}
                          <Tooltip tip="Disk write limit" bottom>
                            <span
                              class="px-2 py-0.5 rounded text-xs text-[var(--pd-status-contrast)] bg-[var(--pd-status-degraded)]">
                              Write: {limit.deviceWriteBpsKB} KB/s
                            </span>
                          </Tooltip>
                        {/if}
                      </div>
                      <Button type="secondary" onclick={removeLimit.bind(undefined, containerId)}>Restore</Button>
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
