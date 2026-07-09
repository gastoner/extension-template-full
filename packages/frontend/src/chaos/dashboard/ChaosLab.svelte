<script lang="ts">
import { Button, EmptyScreen, ErrorMessage } from '@podman-desktop/ui-svelte';
import { faBolt, faSkull } from '@fortawesome/free-solid-svg-icons';
import * as chaos from '../../stores/chaos-store.svelte';
import type { AffectedContainerState, ChaosState, ContainerHealth } from '../../../../shared/src/ChaosApi';
import AffectedContainerCard from './AffectedContainerCard.svelte';

let chaosState: ChaosState | undefined = $derived(await chaos.getChaosState());
let containers: ContainerHealth[] = $derived(await chaos.getContainerHealth());
let affectedRegistry: AffectedContainerState[] = $derived(await chaos.getAffectedContainers());
let errorMessage = $state('');
let actionInProgress = $state(false);

let runningContainers = $derived(containers.filter(c => c.state === 'running'));
let noRunning = $derived(runningContainers.length === 0);
let activeContainers = $derived(affectedRegistry.filter(e => e.activeAttacks.length > 0));

function findHealth(containerId: string): ContainerHealth | undefined {
  return containers.find(c => c.id === containerId);
}

async function stopAll(): Promise<void> {
  if (actionInProgress) return;
  try {
    actionInProgress = true;
    errorMessage = '';
    await chaos.revertAllContainers();
  } catch (err) {
    errorMessage = `Stop all failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    actionInProgress = false;
  }
}

async function startQuickChaos(): Promise<void> {
  if (actionInProgress || noRunning) return;
  const target = runningContainers[Math.floor(Math.random() * runningContainers.length)];
  try {
    actionInProgress = true;
    errorMessage = '';
    await chaos.isolateContainer({
      containerId: target.id,
      containerName: target.name,
      mode: 'pause',
      autoRestoreAfterSec: 30,
      startedAt: Date.now(),
    });
  } catch (err) {
    errorMessage = `Quick chaos failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    actionInProgress = false;
  }
}

function handleRevert(containerId: string): void {
  errorMessage = '';
  chaos.revertContainer(containerId).catch(err => {
    errorMessage = `Revert failed: ${err instanceof Error ? err.message : String(err)}`;
  });
}
</script>

<div class="flex flex-col w-full h-full">
  <div class="flex flex-col w-full h-full pt-4">
    <div class="flex flex-row w-full px-5 pb-2 items-center">
      <div class="text-xl font-bold capitalize text-[var(--pd-content-header)]">Chaos Lab Dashboard</div>
      <div class="flex grow justify-end items-center gap-3">
        {#if chaosState}
          {#if chaosState.killCount > 0}
            <span
              class="px-3 py-1 rounded-full text-xs font-medium text-[var(--pd-status-contrast)] bg-[var(--pd-status-stopped)]">
              {chaosState.killCount} KILLED
            </span>
          {/if}
          <span
            class="px-3 py-1 rounded-full text-xs font-medium text-[var(--pd-status-contrast)]"
            class:bg-[var(--pd-status-running)]={chaosState.runningAttacks === 0}
            class:bg-[var(--pd-status-degraded)]={chaosState.runningAttacks > 0}>
            {chaosState.runningAttacks > 0 ? `${chaosState.runningAttacks} ACTIVE` : 'IDLE'}
          </span>
        {/if}
        {#if chaosState && chaosState.runningAttacks > 0}
          <Button type="danger" onclick={stopAll} icon={faBolt} disabled={actionInProgress}>Stop All Chaos</Button>
        {/if}
      </div>
    </div>

    <div class="flex w-full h-full overflow-auto">
      <div class="flex min-w-full h-full justify-center">
        <div class="flex flex-col space-y-4 min-w-full overflow-y-auto">
          <div class="flex flex-col gap-4 bg-[var(--pd-content-card-bg)] grow p-5">
            {#if errorMessage}
              <ErrorMessage error={errorMessage} />
            {/if}

            {#if activeContainers.length === 0}
              <EmptyScreen
                icon={faSkull}
                title="No chaos in progress"
                message="All containers are running peacefully. Start some chaos to see affected containers here.">
                {#snippet upperContent()}
                  <div>
                    <span class="text-[var(--pd-details-empty-sub-header)] max-w-[800px] text-pretty mx-2">
                      {noRunning
                        ? 'No running containers available'
                        : 'Pause a random running container for 30 seconds:'}
                    </span>
                    <div class="flex gap-2 justify-center p-3">
                      <Button
                        title="Pause a random container for 30 seconds"
                        type="primary"
                        inProgress={actionInProgress}
                        disabled={noRunning}
                        onclick={startQuickChaos}>Start making chaos</Button>
                    </div>
                  </div>
                {/snippet}
              </EmptyScreen>
            {:else}
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {#each activeContainers as entry}
                  <AffectedContainerCard
                    entry={entry}
                    health={findHealth(entry.containerId)}
                    onrevert={() => handleRevert(entry.containerId)} />
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
