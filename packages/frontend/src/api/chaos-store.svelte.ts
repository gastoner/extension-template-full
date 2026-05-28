import { chaosClient } from './client';
import type {
  ChaosState,
  ContainerHealth,
  Scenario,
  IsolationRule,
  StressInjection,
  ConfigSabotage,
  NetworkRule,
  ResourceLimit,
  StressType,
  SabotageType,
} from '/@shared/src/ChaosApi';

let version = $state(0);

function invalidate(): void {
  version++;
}

// Read methods — access `version` to create a reactive dependency
// so $derived(await ...) re-evaluates after any mutation.

export async function getChaosState(): Promise<ChaosState> {
  void version;
  return chaosClient.getChaosState();
}

export async function getContainerHealth(): Promise<ContainerHealth[]> {
  void version;
  return chaosClient.getContainerHealth();
}

export async function listScenarios(): Promise<Scenario[]> {
  void version;
  return chaosClient.listScenarios();
}

export async function listIsolations(): Promise<IsolationRule[]> {
  void version;
  return chaosClient.listIsolations();
}

export async function listStressInjections(): Promise<StressInjection[]> {
  void version;
  return chaosClient.listStressInjections();
}

export async function listConfigSabotages(): Promise<ConfigSabotage[]> {
  void version;
  return chaosClient.listConfigSabotages();
}

export async function getContainerNetworks(containerId: string): Promise<string[]> {
  void version;
  return chaosClient.getContainerNetworks(containerId);
}

export async function checkContainerTool(containerId: string, tool: string): Promise<boolean> {
  void version;
  return chaosClient.checkContainerTool(containerId, tool);
}

// Mutation methods — invalidate after each call so derived values re-fetch.

export async function stopAllChaos(): Promise<void> {
  await chaosClient.stopAllChaos();
  invalidate();
}

export async function createScenario(scenario: Scenario): Promise<void> {
  await chaosClient.createScenario(scenario);
  invalidate();
}

export async function deleteScenario(id: string): Promise<void> {
  await chaosClient.deleteScenario(id);
  invalidate();
}

export async function toggleScenario(id: string, enabled: boolean): Promise<void> {
  await chaosClient.toggleScenario(id, enabled);
  invalidate();
}

export async function applyNetworkRule(rule: NetworkRule): Promise<void> {
  await chaosClient.applyNetworkRule(rule);
  invalidate();
}

export async function removeNetworkRule(containerId: string): Promise<void> {
  await chaosClient.removeNetworkRule(containerId);
  invalidate();
}

export async function applyResourceLimit(limit: ResourceLimit): Promise<void> {
  await chaosClient.applyResourceLimit(limit);
  invalidate();
}

export async function removeResourceLimit(containerId: string): Promise<void> {
  await chaosClient.removeResourceLimit(containerId);
  invalidate();
}

export async function isolateContainer(rule: IsolationRule): Promise<void> {
  await chaosClient.isolateContainer(rule);
  invalidate();
}

export async function restoreContainer(containerId: string): Promise<void> {
  await chaosClient.restoreContainer(containerId);
  invalidate();
}

export async function injectStress(
  containerId: string,
  type: StressType,
  workers?: number,
  targetMb?: number,
): Promise<void> {
  await chaosClient.injectStress(containerId, type, workers, targetMb);
  invalidate();
}

export async function stopStress(containerId: string): Promise<void> {
  await chaosClient.stopStress(containerId);
  invalidate();
}

export async function corruptConfig(
  containerId: string,
  type: SabotageType,
  targetFile?: string,
): Promise<void> {
  await chaosClient.corruptConfig(containerId, type, targetFile);
  invalidate();
}

export async function restoreConfig(containerId: string): Promise<void> {
  await chaosClient.restoreConfig(containerId);
  invalidate();
}

export async function enableChaosMode(intervalSec: number): Promise<void> {
  await chaosClient.enableChaosMode(intervalSec);
  invalidate();
}

export async function disableChaosMode(): Promise<void> {
  await chaosClient.disableChaosMode();
  invalidate();
}

export async function installContainerTool(containerId: string, tool: string): Promise<void> {
  await chaosClient.installContainerTool(containerId, tool);
  invalidate();
}
