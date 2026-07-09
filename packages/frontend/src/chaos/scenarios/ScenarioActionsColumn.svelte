<script lang="ts">
import { faBolt, faFileExport, faPlay, faStop, faTrash } from '@fortawesome/free-solid-svg-icons';
import ListItemButtonIcon from '../../lib/ListItemButtonIcon.svelte';
import type { ScenarioActionsCell } from './scenario-table';

interface Props {
  object: ScenarioActionsCell;
}

let { object }: Props = $props();
</script>

<div class="flex justify-end">
  <ListItemButtonIcon
    title={object.scenario.enabled
      ? 'Stop this scenario and revert all its active attacks'
      : 'Start this scenario on its interval'}
    icon={object.scenario.enabled ? faStop : faPlay}
    onClick={object.onToggle} />
  <ListItemButtonIcon title="Run scenario once" onClick={object.onRun} icon={faBolt} />
  <ListItemButtonIcon title="Export this scenario" onClick={object.onExport} icon={faFileExport} />
  <ListItemButtonIcon title="Delete scenario" onClick={object.onDelete} icon={faTrash} />
</div>
