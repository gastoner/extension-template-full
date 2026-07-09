<script lang="ts">
import { goto } from '$app/navigation';
import { ErrorMessage } from '@podman-desktop/ui-svelte';
import ScenarioForm from '../../../../chaos/scenarios/ScenarioForm.svelte';
import * as chaos from '../../../../stores/chaos-store.svelte';
import type { ContainerHealth } from '../../../../../shared/src/ChaosApi';

let containers: ContainerHealth[] = $derived(await chaos.getContainerHealth());
let errorMessage = $state('');
</script>

<div class="flex flex-col w-full h-full overflow-y-auto p-5">
  {#if errorMessage}
    <div class="mb-4"><ErrorMessage error={errorMessage} /></div>
  {/if}

  <ScenarioForm
    containers={containers}
    oncancel={() => goto('/chaos/scenarios')}
    oncreated={() => goto('/chaos/scenarios')}
    onerror={msg => {
      errorMessage = msg;
    }} />
</div>
