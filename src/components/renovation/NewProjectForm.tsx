import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { HomeyRoom } from "@/server/renovation";
import {
  ALL_CATEGORIES,
  ALL_PRIORITIES,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  type ProjectCategory,
  type ProjectPriority,
  type ProjectStatus,
  type RenovationLocation,
} from "./types";

export function NewProjectForm({
  location,
  rooms,
  onCreated,
}: {
  location: RenovationLocation;
  rooms: HomeyRoom[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planlagt");
  const [category, setCategory] = useState<ProjectCategory>("annet");
  const [priority, setPriority] = useState<ProjectPriority>("middels");
  const [roomName, setRoomName] = useState("");
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [budget, setBudget] = useState<string>("");
  const [busy, setBusy] = useState(false);

  function pickRoom(value: string) {
    setRoomName(value);
    const match = rooms.find((r) => r.name === value);
    setZoneId(match?.homey_zone_id ?? null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("renovation_projects").insert({
      location,
      title: title.trim(),
      description: description.trim() || null,
      status,
      category,
      priority,
      room_name: roomName || null,
      homey_zone_id: zoneId,
      planned_start: plannedStart || null,
      planned_end: plannedEnd || null,
      budget_nok: budget ? Number(budget) : 0,
    });
    setBusy(false);
    if (!error) {
      setTitle("");
      setDescription("");
      setRoomName("");
      setZoneId(null);
      setPlannedStart("");
      setPlannedEnd("");
      setBudget("");
      onCreated();
    }
  }

  return (
    <form onSubmit={submit} className="panel rounded-lg p-5 mb-6 grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2">
        <Label>Tittel</Label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="F.eks. «Nytt tak over storsalen»"
          className="w-full rounded border border-border bg-background/60 px-3 py-2 text-sm"
          required
        />
      </div>
      <div className="md:col-span-2">
        <Label>Beskrivelse</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Hva skal gjøres? Materialer, planer…"
          className="w-full rounded border border-border bg-background/60 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <Label>Rom (fra Homey)</Label>
        <input
          list="renovation-rooms"
          value={roomName}
          onChange={(e) => pickRoom(e.target.value)}
          placeholder={rooms.length === 0 ? "Synk Homey først, eller skriv selv" : "Velg eller skriv…"}
          className="w-full rounded border border-border bg-background/60 px-3 py-2 text-sm"
        />
        <datalist id="renovation-rooms">
          {rooms.map((r) => (
            <option key={r.id} value={r.name} />
          ))}
        </datalist>
      </div>
      <div>
        <Label>Kategori</Label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ProjectCategory)}
          className="w-full rounded border border-border bg-background/60 px-3 py-2 text-sm"
        >
          {ALL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Status</Label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          className="w-full rounded border border-border bg-background/60 px-3 py-2 text-sm"
        >
          <option value="planlagt">Planlagt</option>
          <option value="pagaende">Pågående</option>
          <option value="ferdig">Ferdig</option>
        </select>
      </div>
      <div>
        <Label>Prioritet</Label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as ProjectPriority)}
          className="w-full rounded border border-border bg-background/60 px-3 py-2 text-sm"
        >
          {ALL_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Planlagt start</Label>
        <input
          type="date"
          value={plannedStart}
          onChange={(e) => setPlannedStart(e.target.value)}
          className="w-full rounded border border-border bg-background/60 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <Label>Planlagt slutt</Label>
        <input
          type="date"
          value={plannedEnd}
          onChange={(e) => setPlannedEnd(e.target.value)}
          className="w-full rounded border border-border bg-background/60 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <Label>Budsjett (NOK)</Label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="0"
          className="w-full rounded border border-border bg-background/60 px-3 py-2 text-sm"
        />
      </div>
      <div className="md:col-span-2 flex items-end">
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="ml-auto px-4 py-2 rounded border border-primary/60 text-primary text-[11px] tracking-[0.3em] uppercase hover:bg-primary/10 disabled:opacity-50"
        >
          {busy ? "Hugger i stein…" : "Reis prosjektet"}
        </button>
      </div>
    </form>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-1">
      {children}
    </label>
  );
}
