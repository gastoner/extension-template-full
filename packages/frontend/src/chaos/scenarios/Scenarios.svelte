<script lang="ts">
import {
  Button,
  ErrorMessage,
  FilteredEmptyScreen,
  NavPage,
  Table,
  TableColumn,
  TableRow,
  TableSimpleColumn,
  Tooltip,
} from '@podman-desktop/ui-svelte';
import { goto } from '$app/navigation';
import { faBolt, faFileExport, faPlus, faFileImport, faTrash } from '@fortawesome/free-solid-svg-icons';
import * as chaos from '../../stores/chaos-store.svelte';
import ScenarioNameColumn from './ScenarioNameColumn.svelte';
import ScenarioStepsColumn from './ScenarioStepsColumn.svelte';
import ScenarioStatusColumn from './ScenarioStatusColumn.svelte';
import ScenarioActionsColumn from './ScenarioActionsColumn.svelte';
import { attackOptions } from './scenario-table';
import type { ScenarioStepsCell, ScenarioActionsCell, ScenarioUI } from './scenario-table';
import type { Scenario, ContainerHealth, ScenarioStep } from '../../../../shared/src/ChaosApi';

let searchTerm = $state('');
let scenariosData: Scenario[] = $derived(await chaos.listScenarios());

let allScenarios: ScenarioUI[] = $state([]);
$effect(() => {
  allScenarios = scenariosData.map(s => ({ ...s, selected: false }) as ScenarioUI);
});

function matchesSearch(s: ScenarioUI, term: string): boolean {
  if (!term) return true;
  const lower = term.toLowerCase();
  return (
    s.name.toLowerCase().includes(lower) ||
    s.targetStrategy.toLowerCase().includes(lower) ||
    s.steps.some(
      step =>
        step.attackType.toLowerCase().includes(lower) ||
        (step.targetContainerIds ?? []).some(id => resolveContainerName(id).toLowerCase().includes(lower)),
    )
  );
}

let scenarios: ScenarioUI[] = $derived(allScenarios.filter(s => matchesSearch(s, searchTerm)));
let selectedItemsNumber = $state(0);
let selectedScenarioIds: string[] = $derived(scenarios.filter(s => s.selected).map(s => s.id));

let containers: ContainerHealth[] = $derived(await chaos.getContainerHealth());
let errorMessage = $state('');

function resolveContainerName(id: string): string {
  return containers.find(c => c.id === id)?.name ?? id.substring(0, 12);
}

function stepSummary(step: ScenarioStep): string {
  const label = attackOptions.find(o => o.value === step.attackType)?.label ?? step.attackType;
  const parts = [label];
  if (step.targetContainerIds?.length) {
    const names = step.targetContainerIds.map(id => resolveContainerName(id));
    parts.push(`\u2192 ${names.join(', ')}`);
  }
  if (step.delaySec && step.delaySec > 0) parts.push(`delay ${step.delaySec}s`);
  if (step.attackType === 'network-shape') {
    if (step.latencyMs) parts.push(`${step.latencyMs}ms`);
    if (step.packetLossPercent) parts.push(`${step.packetLossPercent}% loss`);
    if (step.bandwidthKbps) parts.push(`${step.bandwidthKbps}kbps`);
  }
  if (step.attackType === 'resource-limit') {
    if (step.cpuPercent) parts.push(`CPU ${(step.cpuPercent / 100).toFixed(2)} cores`);
    if (step.memoryMb) parts.push(`${step.memoryMb}MB RAM`);
  }
  return parts.join(', ');
}

function scenarioAction(label: string, fn: () => Promise<void>): () => void {
  return () => {
    errorMessage = '';
    fn().catch(err => {
      errorMessage = `Failed to ${label}: ${err instanceof Error ? err.message : String(err)}`;
    });
  };
}

const statusColumn = new TableColumn<ScenarioUI, boolean>('Status', {
  align: 'center',
  width: '70px',
  renderMapping: s => s.enabled,
  renderer: ScenarioStatusColumn,
  comparator: (a, b) => Number(b.enabled) - Number(a.enabled),
});

const nameColumn = new TableColumn<ScenarioUI, string>('Name', {
  width: '2fr',
  renderMapping: s => s.name,
  renderer: ScenarioNameColumn,
  comparator: (a, b) => a.name.localeCompare(b.name),
});

const scheduleColumn = new TableColumn<ScenarioUI, string>('Schedule', {
  width: '110px',
  renderMapping: s => `${s.intervalSec}s / ${s.targetStrategy}`,
  renderer: TableSimpleColumn,
  comparator: (a, b) => a.intervalSec - b.intervalSec,
});

const stepsColumn = new TableColumn<ScenarioUI, ScenarioStepsCell>('Steps', {
  width: '3fr',
  renderMapping: s => ({
    steps: s.steps,
    summarize: stepSummary,
    label: step => attackOptions.find(o => o.value === step.attackType)?.label ?? step.attackType,
  }),
  renderer: ScenarioStepsColumn,
  comparator: (a, b) => a.steps.length - b.steps.length,
});

const actionsColumn = new TableColumn<ScenarioUI, ScenarioActionsCell>('Actions', {
  align: 'right',
  width: '150px',
  overflow: true,
  renderMapping: s => ({
    scenario: s,
    onToggle: scenarioAction('toggle scenario', () => chaos.toggleScenario(s.id, !s.enabled)),
    onRun: scenarioAction('run scenario', () => chaos.runScenarioOnce(s.id)),
    onExport: scenarioAction('export scenario', () => chaos.exportScenarios([s.id])),
    onDelete: scenarioAction('delete scenario', () => chaos.deleteScenario(s.id)),
  }),
  renderer: ScenarioActionsColumn,
});

const scenarioColumns = [statusColumn, nameColumn, scheduleColumn, stepsColumn, actionsColumn];
const scenarioRow = new TableRow<ScenarioUI>({ selectable: (): boolean => true });

function bulkAction(label: string, fn: (ids: string[]) => Promise<void>): () => void {
  return scenarioAction(label, () => fn(selectedScenarioIds));
}

async function deleteSelected(ids: string[]): Promise<void> {
  for (const id of ids) {
    await chaos.deleteScenario(id);
  }
}

async function runSelected(ids: string[]): Promise<void> {
  for (const id of ids) {
    await chaos.runScenarioOnce(id);
  }
}
</script>

<NavPage bind:searchTerm={searchTerm} title="scenarios">
  {#snippet additionalActions()}
    <Button
      type="secondary"
      onclick={scenarioAction('import scenarios', () => chaos.importScenarios())}
      icon={faFileImport}
      title="Import scenarios from a JSON file">
      Import
    </Button>
    <Button type="primary" onclick={() => goto('/chaos/scenarios/new')} icon={faPlus}>New Scenario</Button>
  {/snippet}

  {#snippet bottomAdditionalActions()}
    {#if selectedItemsNumber > 0}
      <Tooltip tip="Run {selectedItemsNumber} selected scenarios once" bottom>
        <Button
          type="secondary"
          icon={faBolt}
          onclick={bulkAction('run selected scenarios', runSelected)}
          title="Run selected" />
      </Tooltip>
      <Tooltip tip="Export {selectedItemsNumber} selected scenarios" bottom>
        <Button
          type="secondary"
          icon={faFileExport}
          onclick={bulkAction('export selected scenarios', ids => chaos.exportScenarios(ids))}
          title="Export selected" />
      </Tooltip>
      <Tooltip tip="Delete {selectedItemsNumber} selected scenarios" bottom>
        <Button
          type="secondary"
          icon={faTrash}
          onclick={bulkAction('delete selected scenarios', deleteSelected)}
          title="Delete selected" />
      </Tooltip>
      <span class="text-[var(--pd-content-text)]">On {selectedItemsNumber} selected items.</span>
    {/if}
  {/snippet}

  {#snippet content()}
    <div class="flex flex-col min-w-full h-full">
      {#if errorMessage}
        <div class="mx-5 mb-4"><ErrorMessage error={errorMessage} /></div>
      {/if}

      <div class="flex min-w-full h-full">
        <Table
          kind="chaos-scenarios"
          data={scenarios}
          columns={scenarioColumns}
          row={scenarioRow}
          bind:selectedItemsNumber={selectedItemsNumber}
          defaultSortColumn="Name"
          key={s => s.id}
          label={s => s.name} />

        {#if scenarios.length === 0}
          {#if searchTerm}
            <FilteredEmptyScreen kind="scenarios" bind:searchTerm={searchTerm} />
          {:else}
            <div class="flex-1 flex items-center justify-center text-[var(--pd-content-text)] opacity-60 py-12">
              No scenarios configured yet. Click "New Scenario" to create one.
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/snippet}
</NavPage>
