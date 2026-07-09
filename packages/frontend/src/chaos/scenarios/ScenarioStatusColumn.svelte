<script lang="ts">
import { StatusIcon } from '@podman-desktop/ui-svelte';

interface Props {
  object: boolean;
}

let { object: enabled }: Props = $props();
</script>

<div class="grid place-content-center" title={enabled ? 'Running' : 'Stopped'}>
  <StatusIcon status={enabled ? 'RUNNING' : 'STOPPED'} />
</div>
