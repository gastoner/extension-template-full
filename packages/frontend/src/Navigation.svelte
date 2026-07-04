<script lang="ts">
import { Tooltip } from '@podman-desktop/ui-svelte';
import { Icon } from '@podman-desktop/ui-svelte/icons';
import {
  faBolt,
  faCalendarAlt,
  faNetworkWired,
  faTachometerAlt,
  faBan,
  faTornado,
  faFire,
  faBiohazard,
  faHistory,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { page } from '$app/state';
import { onDestroy } from 'svelte';

const MIN_WIDTH = 60;
const MAX_WIDTH = 190;
const EXPANDED_THRESHOLD = 80;
const STORAGE_KEY = 'chaos-lab-nav-width';

interface NavEntry {
  icon: IconDefinition;
  title: string;
  href: string;
}

const navEntries: NavEntry[] = [
  { icon: faBolt, title: 'Dashboard', href: '/chaos' },
  { icon: faCalendarAlt, title: 'Scenarios', href: '/chaos/scenarios' },
  { icon: faNetworkWired, title: 'Network Shaper', href: '/chaos/network' },
  { icon: faTachometerAlt, title: 'Resource Limiter', href: '/chaos/resources' },
  { icon: faBan, title: 'Container Isolator', href: '/chaos/isolate' },
  { icon: faFire, title: 'Stress Injector', href: '/chaos/stress' },
  { icon: faBiohazard, title: 'Config Sabotage', href: '/chaos/config' },
  { icon: faHistory, title: 'Affected Containers', href: '/chaos/affected' },
];

function loadWidth(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const val = Number(stored);
      if (Number.isFinite(val)) return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, val));
    }
  } catch {
    /* ignore */
  }
  return 170;
}

let navWidth = $state(loadWidth());
let expanded = $derived(navWidth > EXPANDED_THRESHOLD);
let isDragging = $state(false);
let pathname = $derived(page.url.pathname);

let resizeStartX = 0;
let resizeStartWidth = 0;

function onResizePointerDown(e: PointerEvent): void {
  e.preventDefault();
  isDragging = true;
  resizeStartX = e.clientX;
  resizeStartWidth = navWidth;
  window.addEventListener('pointermove', onResizeMove);
  window.addEventListener('pointerup', onResizeUp);
}

function onResizeMove(e: PointerEvent): void {
  const dx = e.clientX - resizeStartX;
  navWidth = Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartWidth + dx)));
}

function onResizeUp(): void {
  isDragging = false;
  window.removeEventListener('pointermove', onResizeMove);
  window.removeEventListener('pointerup', onResizeUp);
  persistWidth();
}

function toggleNavWidth(): void {
  navWidth = expanded ? MIN_WIDTH : MAX_WIDTH;
  persistWidth();
}

function onResizeDblClick(): void {
  toggleNavWidth();
}

function persistWidth(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.round(navWidth)));
  } catch {
    /* ignore */
  }
}

onDestroy(() => {
  window.removeEventListener('pointermove', onResizeMove);
  window.removeEventListener('pointerup', onResizeUp);
  isDragging = false;
});
</script>

<nav
  class="group relative h-full flex-shrink-0 flex flex-col overflow-hidden bg-[var(--pd-secondary-nav-bg)] border-[var(--pd-global-nav-bg-border)] border-r-[1px]"
  class:select-none={isDragging}
  style:width="{navWidth}px"
  aria-label="ChaosLabNavigation">
  <!-- Header -->
  <div class="flex items-center overflow-hidden">
    <div class="pt-4 mb-4 flex items-center w-full px-3.5 min-h-9">
      <div class="flex-shrink-0 flex items-center justify-center w-6">
        <Icon icon={faTornado} size="2x" class="text-[var(--pd-button-primary-bg)]" />
      </div>
      <span
        class="text-lg truncate min-w-0 text-[color:var(--pd-secondary-nav-header-text)] overflow-hidden whitespace-nowrap"
        class:ml-2={expanded}
        class:flex-1={expanded}
        class:w-0={!expanded}
        class:opacity-0={!expanded}>
        Chaos Lab
      </span>
    </div>
  </div>

  <!-- Nav items -->
  <div class="flex-1 min-h-0 overflow-hidden hover:overflow-y-auto">
    {#each navEntries as entry}
      {@const selected = pathname === entry.href}
      <a class="no-underline block w-full" href={entry.href} aria-label={entry.title}>
        <Tooltip
          right
          tip={expanded ? undefined : entry.title}
          class="flex items-center w-full min-w-0"
          containerClass="relative w-full min-w-0">
          <div
            class="flex py-2 px-3.5 items-center cursor-pointer min-h-9 w-full border-l-[4px]"
            class:bg-[var(--pd-secondary-nav-selected-bg)]={selected}
            class:border-l-[var(--pd-secondary-nav-selected-highlight)]={selected}
            class:text-[color:var(--pd-secondary-nav-text-selected)]={selected}
            class:border-l-[var(--pd-secondary-nav-bg)]={!selected}
            class:text-[color:var(--pd-secondary-nav-text)]={!selected}
            class:hover:text-[color:var(--pd-secondary-nav-text-hover)]={!selected}
            class:hover:bg-[var(--pd-secondary-nav-text-hover-bg)]={!selected}
            class:hover:border-l-[var(--pd-secondary-nav-text-hover-bg)]={!selected}>
            <div class="flex-shrink-0 flex items-center justify-center w-6">
              <Icon icon={entry.icon} size="1.2x" />
            </div>
            <span
              class="text-sm truncate min-w-0 overflow-hidden whitespace-nowrap"
              class:ml-2={expanded}
              class:flex-1={expanded}
              class:w-0={!expanded}
              class:opacity-0={!expanded}
              aria-label="{entry.title} title">
              {entry.title}
            </span>
          </div>
        </Tooltip>
      </a>
    {/each}
  </div>

  <!-- Resize handle -->
  <div
    class="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-50 hover:bg-[var(--pd-global-nav-icon-selected-highlight)] transition-colors duration-150"
    class:bg-[var(--pd-global-nav-icon-selected-highlight)]={isDragging}
    role="separator"
    aria-orientation="vertical"
    aria-label="Resize navigation bar"
    aria-valuenow={navWidth}
    aria-valuemin={MIN_WIDTH}
    aria-valuemax={MAX_WIDTH}
    onpointerdown={onResizePointerDown}
    ondblclick={onResizeDblClick}>
  </div>
</nav>
