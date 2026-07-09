const STORAGE_KEY = 'chaos-lab-expandable';

function load(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

const states: Record<string, boolean> = $state(load());

export function getExpanded(key: string, defaultValue = true): boolean {
  return states[key] ?? defaultValue;
}

export function setExpanded(key: string, value: boolean): void {
  states[key] = value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify($state.snapshot(states)));
}
