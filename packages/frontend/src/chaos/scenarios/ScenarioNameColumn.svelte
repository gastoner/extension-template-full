<script lang="ts">
interface Props {
  object: string;
}

let { object }: Props = $props();
</script>

<div class="text-[var(--pd-table-body-text-highlight)] max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
  {object}
</div>
