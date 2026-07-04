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
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { page } from '$app/state';

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
];

let pathname = $derived(page.url.pathname);
</script>

<nav
  class="z-1 w-leftsidebar min-w-leftsidebar shadow-xs flex-col justify-between flex bg-[var(--pd-secondary-nav-bg)] border-[var(--pd-global-nav-bg-border)] border-r-[1px] shrink-0 overflow-hidden"
  aria-label="ChaosLabNavigation">
  <!-- Header -->
  <div class="flex items-center">
    <div class="pt-4 pl-3 px-5 mb-6 flex items-center ml-[4px]">
      <Icon icon={faTornado} size="1.5x" class="text-[var(--pd-button-primary-bg)] mr-3" />
      <p class="text-lg first-letter:uppercase text-[color:var(--pd-secondary-nav-header-text)]">Chaos Lab</p>
    </div>
  </div>

  <!-- Nav items -->
  <div class="h-full overflow-hidden hover:overflow-y-auto" style="margin-bottom:auto">
    {#each navEntries as entry}
      {@const selected = pathname === entry.href}
      <a class="no-underline block" href={entry.href} aria-label={entry.title}>
        <Tooltip right tip={entry.title}>
          <div
            class="flex py-2 px-3 items-center cursor-pointer min-h-9 border-l-[4px]"
            class:bg-[var(--pd-secondary-nav-selected-bg)]={selected}
            class:border-[var(--pd-secondary-nav-selected-highlight)]={selected}
            class:text-[color:var(--pd-secondary-nav-text-selected)]={selected}
            class:border-[var(--pd-secondary-nav-bg)]={!selected}
            class:text-[color:var(--pd-secondary-nav-text)]={!selected}
            class:hover:text-[color:var(--pd-secondary-nav-text-hover)]={!selected}
            class:hover:bg-[var(--pd-secondary-nav-text-hover-bg)]={!selected}
            class:hover:border-[var(--pd-secondary-nav-text-hover-bg)]={!selected}>
            <div class="flex-shrink-0 flex items-center justify-center w-6">
              <Icon icon={entry.icon} />
            </div>
            <span class="text-sm ml-2" aria-label="{entry.title} title">
              {entry.title}
            </span>
          </div>
        </Tooltip>
      </a>
    {/each}
  </div>
</nav>
