<script lang="ts">
import { Tooltip } from '@podman-desktop/ui-svelte';
import type { ScenarioStepsCell } from './scenario-table';

interface Props {
  object: ScenarioStepsCell;
}

let { object }: Props = $props();
</script>

<div class="flex flex-wrap gap-1">
  {#each object.steps as step, i (i)}
    <Tooltip tip={object.summarize(step)} bottom>
      <span class="p-1 rounded-md text-sm text-[var(--pd-label-text)] bg-[var(--pd-label-bg)]">
        {i + 1}. {object.label(step)}
      </span>
    </Tooltip>
  {/each}
</div>
