import { usePerUserPersistedState } from "@/hooks/use-per-user-persisted-state";

const KEY = "var.thunderThresholdPct";
const DEFAULT = 9;

export function useThunderThreshold() {
  const [value, setValue] = usePerUserPersistedState<number>(KEY, DEFAULT);
  const clamped = Math.min(99, Math.max(1, Number.isFinite(value as number) ? (value as number) : DEFAULT));
  return [clamped, setValue] as const;
}
