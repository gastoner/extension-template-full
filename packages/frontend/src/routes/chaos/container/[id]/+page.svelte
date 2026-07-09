<script lang="ts">
import { page } from '$app/state';
import ContainerDetail from '../../../../chaos/containers/ContainerDetail.svelte';

let containerId: string = $derived(page.params.id ?? '');
</script>

<ContainerDetail containerId={containerId} />
