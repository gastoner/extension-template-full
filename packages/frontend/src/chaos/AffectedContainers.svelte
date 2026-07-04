<script lang="ts">
import { Button, ErrorMessage, Tooltip, Expandable } from '@podman-desktop/ui-svelte';
import { faUndo } from '@fortawesome/free-solid-svg-icons';
import * as chaos from '../api/chaos-store.svelte';
import { getExpanded, setExpanded } from '../lib/expandable-state.svelte';
import type { AffectedContainerState } from '/@shared/src/ChaosApi';

let affected: AffectedContainerState[] = $derived(await chaos.getAffectedContainers());
let errorMessage = $state('');

async function revert(containerId: string): Promise<void> {
  try {
    errorMessage = '';
    await chaos.revertContainer(containerId);
  } catch (err) {
    errorMessage = `Failed to revert: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function revertAll(): Promise<void> {
  try {
    errorMessage = '';
    await chaos.revertAllContainers();
  } catch (err) {
    errorMessage = `Failed to revert all: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}
</script>

<div class="flex flex-col w-full h-full">
  <div class="flex flex-col w-full h-full pt-4">
    <div class="flex flex-row w-full px-5 pb-2">
      <Expandable
        expanded={getExpanded('affected-containers')}
        onclick={val => setExpanded('affected-containers', val)}>
        {#snippet title()}<div class="text-xl font-bold capitalize text-[var(--pd-content-header)]">
            Affected Containers
          </div>{/snippet}
        <div class="flex flex-col gap-2 text-sm text-[var(--pd-content-text)]">
          <p>
            Containers that have been modified by chaos operations are tracked here. You can revert any container back
            to its original state (resource limits, network connections, running status) with a single click.
          </p>
          <p>
            This registry persists across extension restarts, so even if the extension is reloaded, you can still revert
            containers that were affected in previous sessions.
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

            {#if affected.length === 0}
              <div class="flex flex-col items-center justify-center py-12 text-[var(--pd-content-text)] opacity-60">
                <p class="text-lg">No affected containers</p>
                <p class="text-sm mt-2">Containers modified by chaos operations will appear here.</p>
              </div>
            {:else}
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm text-[var(--pd-content-text)]">
                  {affected.length} container{affected.length !== 1 ? 's' : ''} affected
                </span>
                <Button type="danger" onclick={revertAll} icon={faUndo}>Revert All</Button>
              </div>

              <div class="space-y-2">
                {#each affected as entry}
                  <div
                    class="flex items-center justify-between rounded-lg bg-[var(--pd-content-card-hover-bg)] p-4 transition-colors">
                    <div class="flex flex-col gap-1">
                      <div class="flex items-center gap-3">
                        <span class="font-medium text-[var(--pd-content-header)]">
                          {entry.containerName}
                        </span>
                        <span class="text-xs text-[var(--pd-content-text)] opacity-60">
                          {entry.containerId.substring(0, 12)}
                        </span>
                      </div>
                      <div class="flex items-center gap-2 flex-wrap">
                        {#each entry.activeAttacks as attack}
                          <Tooltip tip={attack} bottom>
                            <span
                              class="px-2 py-0.5 rounded text-xs text-[var(--pd-status-contrast)] bg-[var(--pd-status-degraded)]">
                              {attack}
                            </span>
                          </Tooltip>
                        {/each}
                        {#if entry.activeAttacks.length === 0}
                          <span class="text-xs text-[var(--pd-content-text)] opacity-60 italic">
                            previously affected
                          </span>
                        {/if}
                      </div>
                      <div class="text-xs text-[var(--pd-content-text)] opacity-50 mt-1">
                        First affected: {formatTimestamp(entry.firstAffectedAt)}
                        {#if entry.originalState.wasRunning}
                          &bull; Was running
                        {:else}
                          &bull; Was stopped
                        {/if}
                        {#if entry.originalState.networks.length > 0}
                          &bull; Networks: {entry.originalState.networks.join(', ')}
                        {/if}
                      </div>
                    </div>
                    <Button type="secondary" onclick={() => revert(entry.containerId)} icon={faUndo}>Revert</Button>
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
