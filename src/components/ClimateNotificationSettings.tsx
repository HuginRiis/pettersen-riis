import { Thermometer, Snowflake, Flame, Users } from "lucide-react";
import { usePersistedState } from "@/hooks/use-persisted-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RoomKey = "stua" | "soverommet" | "hytta-stua";

type Settings = {
  enabled: boolean;
  notifyHot: boolean;
  hot: number;
  notifyCold: boolean;
  cold: number;
  recipient: string;
};

const WHO_OPTIONS = [
  "Alle",
  "Arne & Rebekka",
  "Arne",
  "Rebekka",
  "Marita",
  "Nora",
  "Celine",
  "Mira",
] as const;

const DEFAULTS: Record<RoomKey, Settings> = {
  stua: { enabled: true, notifyHot: true, hot: 25, notifyCold: true, cold: 18, recipient: "Alle" },
  soverommet: { enabled: true, notifyHot: true, hot: 23, notifyCold: true, cold: 16, recipient: "Alle" },
  "hytta-stua": { enabled: true, notifyHot: true, hot: 25, notifyCold: true, cold: 10, recipient: "Alle" },
};

const ROOM_LABEL: Record<RoomKey, string> = {
  stua: "Borgen · Stua",
  soverommet: "Borgen · Soverommet",
  "hytta-stua": "Hytta · Stua",
};

function TempPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${
        disabled ? "opacity-50" : ""
      }`}
      style={{
        background: "color-mix(in oklab, var(--foreground) 6%, transparent)",
        border: "1px solid color-mix(in oklab, var(--gold) 25%, transparent)",
      }}
    >
      <button
        type="button"
        aria-label="Senk"
        disabled={disabled || value <= 10}
        onClick={() => onChange(Math.max(10, value - 1))}
        className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--gold)] disabled:opacity-30"
      >
        −
      </button>
      <span className="text-display tabular-nums text-[var(--gold)] min-w-[2.5rem] text-center text-sm">
        {value}°
      </span>
      <button
        type="button"
        aria-label="Hev"
        disabled={disabled || value >= 30}
        onClick={() => onChange(Math.min(30, value + 1))}
        className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--gold)] disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

function RoomCard({ room }: { room: RoomKey }) {
  const [settings, setSettings] = usePersistedState<Settings>(
    `hpr.climateAlerts.${room}`,
    DEFAULTS[room],
  );
  const update = (patch: Partial<Settings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  return (
    <article className="panel rounded-lg p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Thermometer size={16} className="text-[var(--gold)]" />
          <span className="text-display tracking-[0.3em] uppercase text-sm text-primary">
            {ROOM_LABEL[room]}
          </span>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="accent-[var(--gold)]"
          />
          <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
            Aktiv
          </span>
        </label>
      </header>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.notifyHot}
              disabled={!settings.enabled}
              onChange={(e) => update({ notifyHot: e.target.checked })}
              className="accent-[var(--gold)]"
            />
            <Flame size={14} className="text-orange-400" />
            <span>For varmt over</span>
          </label>
          <TempPicker
            value={settings.hot}
            onChange={(v) => update({ hot: v })}
            disabled={!settings.enabled || !settings.notifyHot}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.notifyCold}
              disabled={!settings.enabled}
              onChange={(e) => update({ notifyCold: e.target.checked })}
              className="accent-[var(--gold)]"
            />
            <Snowflake size={14} className="text-cyan-300" />
            <span>For kaldt under</span>
          </label>
          <TempPicker
            value={settings.cold}
            onChange={(v) => update({ cold: v })}
            disabled={!settings.enabled || !settings.notifyCold}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-sm">
            <Users size={14} className="text-[var(--gold)]" />
            <span>Mottaker</span>
          </div>
          <Select
            value={settings.recipient}
            disabled={!settings.enabled}
            onValueChange={(v) => update({ recipient: v })}
          >
            <SelectTrigger className="h-8 w-[160px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WHO_OPTIONS.map((w) => (
                <SelectItem key={w} value={w}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground italic leading-relaxed">
        Ravnen flyr til {settings.recipient.toLowerCase()} når temperaturen forlater området {settings.cold}°–{settings.hot}°.
      </p>
    </article>
  );
}

export function ClimateNotificationSettings() {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <RoomCard room="stua" />
      <RoomCard room="soverommet" />
      <RoomCard room="hytta-stua" />
    </div>
  );
}
