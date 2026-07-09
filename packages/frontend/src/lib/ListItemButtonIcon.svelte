<script lang="ts">
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { Spinner, Tooltip } from '@podman-desktop/ui-svelte';
import Fa from 'svelte-fa';

interface Props {
  title: string;
  icon: IconDefinition;
  enabled?: boolean;
  inProgress?: boolean;
  hidden?: boolean;
  onClick?: () => void;
}

let { title, icon, enabled = true, inProgress = false, hidden = false, onClick = (): void => {} }: Props = $props();

const buttonClass =
  'text-[var(--pd-action-button-text)] hover:bg-[var(--pd-action-button-hover-bg)] hover:text-[var(--pd-action-button-hover-text)] font-medium rounded-full inline-flex items-center px-2 py-2 text-center';
const buttonDisabledClass =
  'text-[var(--pd-action-button-disabled-text)] font-medium rounded-full inline-flex items-center px-2 py-2 text-center';

let styleClass = $derived(enabled && !inProgress ? buttonClass : buttonDisabledClass);
</script>

<Tooltip tip={title} bottom>
  <button
    type="button"
    aria-label={title}
    onclick={onClick}
    class="{styleClass} relative"
    class:hidden={hidden}
    disabled={!enabled || inProgress}>
    {#if inProgress}
      <Spinner size="1em" />
    {:else}
      <Fa icon={icon} class="h-4 w-4" />
    {/if}
  </button>
</Tooltip>
