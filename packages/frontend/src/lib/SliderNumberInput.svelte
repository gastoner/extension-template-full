<script lang="ts">
import { NumberInput } from '@podman-desktop/ui-svelte';

interface Props {
  value: number;
  minimum?: number;
  maximum?: number;
  step?: number;
  label?: string;
}

let { value = $bindable(), minimum = 0, maximum = 100, step = 1, label = '' }: Props = $props();
</script>

<div class="flex items-center gap-3 w-full">
  <input
    type="range"
    bind:value={value}
    min={minimum}
    max={maximum}
    step={step}
    aria-label={label}
    class="flex-1 h-1 bg-[var(--pd-input-toggle-on-bg)] rounded-lg appearance-none accent-[var(--pd-input-toggle-on-bg)] cursor-pointer" />
  <NumberInput
    class="w-24"
    bind:value={value}
    minimum={minimum}
    maximum={maximum}
    step={step}
    type="integer"
    aria-label="{label} value" />
</div>
