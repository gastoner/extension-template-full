<script lang="ts">
import { page } from '$app/state';
import ContainerDetail from '../../../../chaos/ContainerDetail.svelte';

let containerId: string = $derived(page.params.id ?? '');
</script>

<ContainerDetail containerId={containerId} />
