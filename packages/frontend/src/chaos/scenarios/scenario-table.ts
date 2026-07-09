import type { Scenario, ScenarioStep } from '../../../../shared/src/ChaosApi';

/** Scenario augmented with the `selected` flag the Table component needs for its checkboxes. */
export interface ScenarioUI extends Scenario {
  selected: boolean;
}

export interface ScenarioStepsCell {
  steps: ScenarioStep[];
  summarize: (step: ScenarioStep) => string;
  label: (step: ScenarioStep) => string;
}

export interface ScenarioActionsCell {
  scenario: Scenario;
  onToggle: () => void;
  onRun: () => void;
  onExport: () => void;
  onDelete: () => void;
}

export interface StepForm {
  attackType: string;
  delaySec: number;
  overrideTargets: boolean;
  targetContainerIds: string[];
  latencyMs: number;
  packetLossPercent: number;
  bandwidthKbps: number;
  cpuPercent: number;
  memoryMb: number;
}

export function createDefaultStep(): StepForm {
  return {
    attackType: 'stop',
    delaySec: 0,
    overrideTargets: false,
    targetContainerIds: [],
    latencyMs: 100,
    packetLossPercent: 5,
    bandwidthKbps: 1000,
    cpuPercent: 50,
    memoryMb: 64,
  };
}

export const strategyOptions = [
  { value: 'random', label: 'Random' },
  { value: 'all', label: 'All Containers' },
  { value: 'specific', label: 'Specific' },
];

export const attackOptions: { value: string; label: string }[] = [
  { value: 'stop', label: 'Stop' },
  { value: 'kill', label: 'Kill' },
  { value: 'pause', label: 'Pause' },
  { value: 'restart', label: 'Restart' },
  { value: 'network-shape', label: 'Network Shaping' },
  { value: 'resource-limit', label: 'Resource Limit' },
  { value: 'network-disconnect', label: 'Network Disconnect' },
  { value: 'stress', label: 'Stress (CPU)' },
  { value: 'config-sabotage', label: 'Config Sabotage (DNS)' },
];
