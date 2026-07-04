<script lang="ts">
import { Button, Dropdown, Input, ErrorMessage, Tooltip, Expandable } from '@podman-desktop/ui-svelte';
import { faBiohazard } from '@fortawesome/free-solid-svg-icons';
import * as chaos from '../api/chaos-store.svelte';
import { getExpanded, setExpanded } from '../lib/expandable-state.svelte';
import type { ContainerHealth, ConfigSabotage, SabotageType } from '/@shared/src/ChaosApi';

let containers: ContainerHealth[] = $derived(await chaos.getContainerHealth());
let activeSabotages: ConfigSabotage[] = $derived(await chaos.listConfigSabotages());

let selectedContainer = $state('');
let sabotageType: SabotageType = $state('dns-blackhole');
let targetFile = $state('/etc/hostname');
let errorMessage = $state('');

let runningContainers = $derived(containers.filter(c => c.state === 'running'));
let containerOptions = $derived(
  runningContainers.length > 0
    ? runningContainers.map(c => ({ value: c.id, label: c.name }))
    : [{ value: '', label: 'No running containers' }],
);
let noRunning = $derived(runningContainers.length === 0);

const sabotageTypeOptions = [
  { value: 'dns-blackhole', label: 'DNS Blackhole' },
  { value: 'file-corrupt', label: 'File Corruption' },
];

async function corrupt(): Promise<void> {
  if (!selectedContainer) return;
  try {
    errorMessage = '';
    await chaos.corruptConfig(
      selectedContainer,
      sabotageType,
      sabotageType === 'file-corrupt' ? targetFile : undefined,
    );
  } catch (err) {
    errorMessage = `Failed to apply sabotage: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function restore(containerId: string): Promise<void> {
  try {
    errorMessage = '';
    await chaos.restoreConfig(containerId);
  } catch (err) {
    errorMessage = `Failed to restore config: ${err instanceof Error ? err.message : String(err)}`;
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
      <Expandable expanded={getExpanded('config-sabotage')} onclick={val => setExpanded('config-sabotage', val)}>
        {#snippet title()}<div class="text-xl font-bold capitalize text-[var(--pd-content-header)]">
            Config Sabotage
          </div>{/snippet}
        <div class="flex flex-col gap-2 text-sm text-[var(--pd-content-text)]">
          <p>
            Corrupt configuration files inside a running container to test how your application handles broken configs.
            Original file contents are saved for rollback.
          </p>
          <ul class="list-disc pl-5 space-y-1">
            <li>
              <strong>DNS Blackhole</strong> — Overwrites
              <code class="text-xs bg-[var(--pd-input-field-bg)] px-1 rounded">/etc/resolv.conf</code> with a loopback nameserver,
              breaking all DNS resolution inside the container.
            </li>
            <li>
              <strong>File Corruption</strong> — Overwrites a specified file with random binary data. Use this to test how
              your app handles corrupted config files, certificates, or data files.
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
              <span class="block text-xs text-[var(--pd-content-text)] mb-1">Target Container</span>
              <Dropdown
                bind:value={selectedContainer}
                options={containerOptions}
                disabled={noRunning}
                ariaLabel="Target container" />
            </div>

            <div>
              <span class="block text-xs text-[var(--pd-content-text)] mb-1">Sabotage Type</span>
              <Dropdown bind:value={sabotageType} options={sabotageTypeOptions} ariaLabel="Sabotage type" />
            </div>

            {#if sabotageType === 'file-corrupt'}
              <div>
                <span class="block text-xs text-[var(--pd-content-text)] mb-1">Target File Path</span>
                <Input bind:value={targetFile} placeholder="/etc/hostname" aria-label="Target file" />
              </div>
            {/if}

            <div class="text-xs text-[var(--pd-content-text)] opacity-70">
              {#if sabotageType === 'dns-blackhole'}
                Overwrites /etc/resolv.conf with loopback nameserver, breaking DNS resolution.
              {:else}
                Overwrites the target file with random data. Original content is saved for rollback.
              {/if}
            </div>

            <div class="w-full flex flex-row space-x-4 pt-4 border-t-2 border-[var(--pd-content-divider)]">
              <Button type="danger" class="w-full" onclick={corrupt} icon={faBiohazard}>Apply Sabotage</Button>
            </div>

            {#if activeSabotages.length > 0}
              <div class="pt-4">
                <h2 class="text-xl pt-2 grow mb-3">Active Sabotages</h2>
                <div class="space-y-2">
                  {#each activeSabotages as sabotage}
                    <div
                      class="flex items-center justify-between rounded-lg bg-[var(--pd-content-card-hover-bg)] p-4 transition-colors">
                      <div class="flex items-center gap-4 text-sm">
                        <span class="font-medium text-[var(--pd-content-header)]">
                          {sabotage.containerName}
                        </span>
                        <Tooltip tip="Sabotage type" bottom>
                          <span
                            class="px-2 py-0.5 rounded text-xs text-[var(--pd-status-contrast)] bg-[var(--pd-status-degraded)]">
                            {sabotage.type}
                          </span>
                        </Tooltip>
                        {#if sabotage.targetFile}
                          <span class="text-xs text-[var(--pd-content-text)] font-mono">
                            {sabotage.targetFile}
                          </span>
                        {/if}
                        <span class="text-xs text-[var(--pd-content-text)]">
                          {formatElapsed(sabotage.startedAt)}
                        </span>
                      </div>
                      <Button type="secondary" onclick={restore.bind(undefined, sabotage.containerId)}>Restore</Button>
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
