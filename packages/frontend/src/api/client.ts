import type { ChaosApi } from '/@shared/src/ChaosApi';
import { RpcBrowser } from '/@shared/src/messages/MessageProxy';

export interface RouterState {
  url: string;
}
const podmanDesktopApi = acquirePodmanDesktopApi();
export const rpcBrowser: RpcBrowser = new RpcBrowser(window, podmanDesktopApi);

export const chaosClient: ChaosApi = rpcBrowser.getProxy<ChaosApi>();

export const saveRouterState = (state: RouterState) => {
  podmanDesktopApi.setState(state);
};

const isRouterState = (value: unknown): value is RouterState => {
  return typeof value === 'object' && !!value && 'url' in value;
};

export const getRouterState = (): RouterState => {
  const state = podmanDesktopApi.getState();
  if (isRouterState(state)) return state;
  return { url: '/chaos' };
};
