import type { ChaosApi } from '/@shared/src/ChaosApi';
import { RpcBrowser } from '/@shared/src/messages/MessageProxy';
import { browser } from '$app/environment';

export interface RouterState {
  url: string;
}

let podmanDesktopApi: PodmanDesktopApi;
let rpcBrowser: RpcBrowser;
let chaosClient: ChaosApi;

if (browser) {
  podmanDesktopApi = acquirePodmanDesktopApi();
  rpcBrowser = new RpcBrowser(window, podmanDesktopApi);
  chaosClient = rpcBrowser.getProxy<ChaosApi>();
}

export { rpcBrowser, chaosClient };

export const saveRouterState = (state: RouterState): void => {
  if (browser) {
    podmanDesktopApi.setState(state);
  }
};

const isRouterState = (value: unknown): value is RouterState => {
  return typeof value === 'object' && !!value && 'url' in value;
};

export const getRouterState = (): RouterState => {
  if (!browser) return { url: '/chaos' };
  const state = podmanDesktopApi.getState();
  if (isRouterState(state)) return state;
  return { url: '/chaos' };
};
