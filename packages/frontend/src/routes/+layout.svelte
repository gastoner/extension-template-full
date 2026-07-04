<script lang="ts">
import '../app.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { afterNavigate, goto } from '$app/navigation';
import { page } from '$app/state';
import { onMount, onDestroy } from 'svelte';
import { browser } from '$app/environment';
import Navigation from '../Navigation.svelte';
import { saveRouterState, getRouterState } from '../api/client';
import type { Snippet } from 'svelte';

interface Props {
  children: Snippet;
}

let { children }: Props = $props();

let isMounted = false;

function handleBackendMessage(event: MessageEvent): void {
  const message = event.data;
  if (message?.type === 'navigate' && typeof message.url === 'string') {
    goto(message.url);
  }
}

onMount(() => {
  window.addEventListener('message', handleBackendMessage);
  const state = getRouterState();
  if (state.url && state.url !== page.url.pathname) {
    goto(state.url);
  }
  isMounted = true;
});

onDestroy(() => {
  if (browser) {
    window.removeEventListener('message', handleBackendMessage);
  }
});

afterNavigate(() => {
  if (isMounted) {
    saveRouterState({ url: page.url.pathname });
  }
});
</script>

<main class="flex flex-col w-screen h-screen overflow-hidden bg-[var(--pd-content-bg)]">
  <div class="flex flex-row w-full h-full overflow-hidden">
    <Navigation />

    <div class="flex flex-col w-full h-full overflow-hidden">
      {@render children()}
    </div>
  </div>
</main>
