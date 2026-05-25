<script lang="ts">
import { SettingsNavItem } from '@podman-desktop/ui-svelte';
import Icon from '@podman-desktop/ui-svelte/icons/Icon';
import {
  faBolt,
  faCalendarAlt,
  faNetworkWired,
  faTachometerAlt,
  faBan,
  faTornado,
} from '@fortawesome/free-solid-svg-icons';
import type { TinroRouteMeta } from 'tinro';

interface Props {
  meta: TinroRouteMeta;
}

let { meta }: Props = $props();
</script>

<nav
  class="z-1 w-leftsidebar min-w-leftsidebar shadow-xs flex-col justify-between flex transition-all duration-500 ease-in-out bg-[var(--pd-secondary-nav-bg)] border-[var(--pd-global-nav-bg-border)] border-r-[1px]"
  aria-label="ChaosLabNavigation">
  <div class="flex items-center">
    <div class="pt-4 pl-3 px-5 mb-6 flex items-center ml-[4px]">
      <Icon icon={faTornado} size="1.5x" class="text-[var(--pd-button-primary-bg)] cursor-pointer mr-3" />
      <p class="text-lg first-letter:uppercase text-[color:var(--pd-secondary-nav-header-text)]">Chaos Lab</p>
    </div>
  </div>

  <div class="h-full overflow-hidden hover:overflow-y-auto" style="margin-bottom:auto">
    <div class="pl-3 mt-1 ml-[4px]">
      <span class="text-xs uppercase tracking-wider text-[color:var(--pd-secondary-nav-header-text)] opacity-60">Chaos Lab</span>
    </div>
    <SettingsNavItem
      icon={faBolt}
      title="Dashboard"
      selected={meta.url === '/chaos' || meta.url === '/'}
      href="/chaos" />
    <SettingsNavItem
      icon={faCalendarAlt}
      title="Scenarios"
      selected={meta.url === '/chaos/scenarios'}
      href="/chaos/scenarios" />
    <SettingsNavItem
      icon={faNetworkWired}
      title="Network Shaper"
      selected={meta.url === '/chaos/network'}
      href="/chaos/network" />
    <SettingsNavItem
      icon={faTachometerAlt}
      title="Resource Limiter"
      selected={meta.url === '/chaos/resources'}
      href="/chaos/resources" />
    <SettingsNavItem
      icon={faBan}
      title="Container Isolator"
      selected={meta.url === '/chaos/isolate'}
      href="/chaos/isolate" />
  </div>
</nav>
