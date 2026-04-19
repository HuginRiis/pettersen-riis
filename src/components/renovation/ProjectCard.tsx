import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { HomeyRoom } from "@/server/renovation";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Plus,
  Trash2,
  Upload,
  Calendar,
  Wallet,
  Hammer,
  UserPlus,
} from "lucide-react";
import {
  ALL_CATEGORIES,
  ALL_PRIORITIES,
  CATEGORY_ICON,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  type CostLine,
  type Contractor,
  type Project,
  type ProjectCategory,
  type ProjectImage,
  type ProjectPriority,
  type ProjectStatus,
  type Task,
} from "./types";
import { formatNOK } from "./RenovationPage";

export function ProjectCard({
  project,
  tasks,
  images,
  costs,
  contractors,
  rooms,
  onChange,
}: {
  project: Project;
  tasks: Task[];
  images: ProjectImage[];
  costs: CostLine[];
  contractors: Contractor[];
  rooms: HomeyRoom[];
  onChange: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);

  const doneCount = tasks.filter((t) => t.done).length;
  const progress = tasks.length === 0 ? 0 : Math.round((doneCount / tasks.length) * 100);
  const totalSpent = costs.reduce((s, c) => s + Number(c.amount_nok), 0);
  const budget = Number(project.budget_nok ?? 0);
  const overBudget = budget > 0 && totalSpent > budget;

  /* ---------- mutations ---------- */
  async function patch(p: Partial<Project>) {
    await supabase.from("renovation_projects").update(p).eq("id", project.id);
    onChange();
  }
  async function deleteProject() {
    if (!confirm(`Slette «${project.title}»?`)) return;
    await supabase.from("renovation_projects").delete().eq("id", project.id);
    onChange();
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTask.trim()) return;
    setBusy(true);
    await supabase.from("renovation_tasks").insert({
      project_id: project.id,
      label: newTask.trim(),
      sort_order: tasks.length,
    });
    setNewTask("");
    setBusy(false);
    onChange();
  }
  async function toggleTask(t: Task) {
    await supabase.from("renovation_tasks").update({ done: !t.done }).eq("id", t.id);
    onChange();
  }
  async function deleteTask(id: string) {
    await supabase.from("renovation_tasks").delete().eq("id", id);
    onChange();
  }

  async function uploadImages(files: FileList) {
    setBusy(true);
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${project.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("renovation")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) continue;
      const { data: pub } = supabase.storage.from("renovation").getPublicUrl(path);
      await supabase.from("renovation_images").insert({
        project_id: project.id,
        url: pub.publicUrl,
        sort_order: images.length,
      });
      if (!project.cover_image_url) {
        await supabase
          .from("renovation_projects")
          .update({ cover_image_url: pub.publicUrl })
          .eq("id", project.id);
      }
    }
    setBusy(false);
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
    onChange();
  }
  async function deleteImage(img: ProjectImage) {
    const marker = "/renovation/";
    const idx = img.url.indexOf(marker);
    const path = idx >= 0 ? img.url.slice(idx + marker.length) : null;
    if (path) await supabase.storage.from("renovation").remove([path]);
    await supabase.from("renovation_images").delete().eq("id", img.id);
    if (project.cover_image_url === img.url) {
      await supabase
        .from("renovation_projects")
        .update({ cover_image_url: null })
        .eq("id", project.id);
    }
    onChange();
  }

  return (
    <article className="panel rounded-lg overflow-hidden glow-on-hover flex flex-col">
      {/* Cover */}
      {project.cover_image_url ? (
        <div className="aspect-[16/9] overflow-hidden border-b border-border relative">
          <img
            src={project.cover_image_url}
            alt={project.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute top-2 left-2 flex items-center gap-2">
            <span className="text-2xl drop-shadow-lg">{CATEGORY_ICON[project.category]}</span>
          </div>
        </div>
      ) : (
        <div className="aspect-[16/9] flex items-center justify-center border-b border-border bg-muted/20 relative">
          <ImageIcon className="text-muted-foreground/40" size={36} />
          <div className="absolute top-2 left-2 text-2xl">{CATEGORY_ICON[project.category]}</div>
        </div>
      )}

      <div className="p-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base text-primary leading-tight font-display truncate">
              {project.title}
            </h3>
            {project.room_name && (
              <p className="text-[11px] text-muted-foreground tracking-wider mt-0.5">
                📍 {project.room_name}
              </p>
            )}
          </div>
          <button
            onClick={deleteProject}
            className="text-muted-foreground hover:text-destructive shrink-0"
            aria-label="Slett prosjekt"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Pills: status, kategori, prioritet */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            value={project.status}
            onChange={(e) => patch({ status: e.target.value as ProjectStatus })}
            className={`px-2 py-0.5 rounded border text-[9px] tracking-[0.25em] uppercase ${STATUS_TONE[project.status]}`}
          >
            {(["planlagt", "pagaende", "ferdig"] as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={project.priority}
            onChange={(e) => patch({ priority: e.target.value as ProjectPriority })}
            className={`px-2 py-0.5 rounded border bg-background/60 text-[9px] tracking-[0.25em] uppercase ${PRIORITY_TONE[project.priority]}`}
          >
            {ALL_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
          <select
            value={project.category}
            onChange={(e) => patch({ category: e.target.value as ProjectCategory })}
            className="px-2 py-0.5 rounded border border-border bg-background/60 text-[9px] tracking-[0.25em] uppercase text-muted-foreground"
          >
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>

        {/* Progress + budget */}
        <div className="grid grid-cols-2 gap-3">
          <MiniStat
            icon={<Hammer size={11} />}
            label={`${doneCount}/${tasks.length} steg`}
            value={`${progress}%`}
            barPct={progress}
            tone="primary"
          />
          <MiniStat
            icon={<Wallet size={11} />}
            label={budget > 0 ? formatNOK(totalSpent) + " / " + formatNOK(budget) : formatNOK(totalSpent)}
            value={budget > 0 ? `${Math.round((totalSpent / budget) * 100)}%` : "—"}
            barPct={budget > 0 ? Math.min(100, Math.round((totalSpent / budget) * 100)) : 0}
            tone={overBudget ? "warn" : "primary"}
          />
        </div>

        {/* Datoer */}
        {(project.planned_start || project.planned_end) && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground tracking-wider">
            <Calendar size={11} />
            {project.planned_start && fmtDate(project.planned_start)}
            {project.planned_end && ` → ${fmtDate(project.planned_end)}`}
          </div>
        )}

        {/* Kamera-knapper */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
            className="flex-1 px-3 py-2 rounded border border-primary/40 text-primary text-[10px] tracking-[0.25em] uppercase hover:bg-primary/10 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Camera size={12} /> Ta bilde
          </button>
          <button
            onClick={() => galleryRef.current?.click()}
            disabled={busy}
            className="px-3 py-2 rounded border border-border text-muted-foreground text-[10px] tracking-[0.25em] uppercase hover:text-primary hover:border-primary/40 flex items-center gap-2 disabled:opacity-50"
            title="Last opp fra galleri"
          >
            <Upload size={12} />
          </button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files && uploadImages(e.target.files)}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && uploadImages(e.target.files)}
          />
        </div>

        {/* Vis bilder hvis det er flere enn cover */}
        {images.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5">
            {images.slice(0, expanded ? images.length : 4).map((img) => (
              <div
                key={img.id}
                className="relative group aspect-square overflow-hidden rounded border border-border"
              >
                <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                <button
                  onClick={() => deleteImage(img)}
                  className="absolute top-0.5 right-0.5 bg-background/80 rounded p-0.5 text-destructive opacity-0 group-hover:opacity-100"
                  aria-label="Slett bilde"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Toggle detaljer */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-[10px] tracking-[0.3em] uppercase text-muted-foreground hover:text-primary flex items-center justify-center gap-1 pt-1 border-t border-border/50"
        >
          {expanded ? (
            <>
              <ChevronUp size={12} /> Skjul detaljer
            </>
          ) : (
            <>
              <ChevronDown size={12} /> Vis detaljer
            </>
          )}
        </button>

        {expanded && (
          <div className="flex flex-col gap-4 pt-2">
            {/* Beskrivelse + edit */}
            <DescriptionEditor project={project} onSave={(d) => patch({ description: d })} />

            {/* Rom velger */}
            <RoomSelector project={project} rooms={rooms} onSave={(rn, zid) => patch({ room_name: rn, homey_zone_id: zid })} />

            {/* Datoer + budsjett edit */}
            <DatesAndBudget project={project} onSave={patch} />

            {/* Sjekkliste */}
            <div>
              <SectionTitle>Husets plan</SectionTitle>
              <ul className="flex flex-col gap-1.5">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 group">
                    <button
                      onClick={() => toggleTask(t)}
                      className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                        t.done
                          ? "bg-primary/20 border-primary text-primary"
                          : "border-muted-foreground/40 hover:border-primary"
                      }`}
                    >
                      {t.done && <Check size={12} />}
                    </button>
                    <span
                      className={`text-sm flex-1 ${t.done ? "line-through text-muted-foreground" : "text-foreground"}`}
                    >
                      {t.label}
                    </span>
                    <button
                      onClick={() => deleteTask(t.id)}
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
              <form onSubmit={addTask} className="flex gap-2 mt-2">
                <input
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  placeholder="Ny oppgave…"
                  className="flex-1 rounded border border-border bg-background/60 px-2 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy || !newTask.trim()}
                  className="px-3 py-1.5 rounded border border-primary/50 text-primary text-xs hover:bg-primary/10 disabled:opacity-40"
                >
                  <Plus size={14} />
                </button>
              </form>
            </div>

            {/* Kostnader */}
            <CostsSection projectId={project.id} costs={costs} budget={budget} onChange={onChange} />

            {/* Håndverkere */}
            <ContractorsSection projectId={project.id} contractors={contractors} onChange={onChange} />
          </div>
        )}
      </div>
    </article>
  );
}

/* ---------- subcomponents ---------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
      {children}
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  barPct,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  barPct: number;
  tone: "primary" | "warn";
}) {
  const barColor = tone === "warn" ? "bg-amber-500" : "bg-primary";
  const valueColor = tone === "warn" ? "text-amber-400" : "text-primary";
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground tracking-wider mb-1">
        <span className="flex items-center gap-1">
          {icon} {label}
        </span>
        <span className={valueColor}>{value}</span>
      </div>
      <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${barPct}%` }} />
      </div>
    </div>
  );
}

function DescriptionEditor({
  project,
  onSave,
}: {
  project: Project;
  onSave: (d: string | null) => void;
}) {
  const [text, setText] = useState(project.description ?? "");
  const dirty = text !== (project.description ?? "");
  return (
    <div>
      <SectionTitle>Beskrivelse</SectionTitle>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Hva skal gjøres…"
        className="w-full rounded border border-border bg-background/60 px-2 py-1.5 text-sm"
      />
      {dirty && (
        <button
          onClick={() => onSave(text.trim() || null)}
          className="mt-2 text-[10px] tracking-[0.3em] uppercase text-primary hover:underline"
        >
          Lagre
        </button>
      )}
    </div>
  );
}

function RoomSelector({
  project,
  rooms,
  onSave,
}: {
  project: Project;
  rooms: HomeyRoom[];
  onSave: (roomName: string | null, zoneId: string | null) => void;
}) {
  const [val, setVal] = useState(project.room_name ?? "");
  const dirty = val !== (project.room_name ?? "");
  return (
    <div>
      <SectionTitle>Rom</SectionTitle>
      <input
        list={`rooms-${project.id}`}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={rooms.length === 0 ? "Skriv romnavn" : "Velg eller skriv…"}
        className="w-full rounded border border-border bg-background/60 px-2 py-1.5 text-sm"
      />
      <datalist id={`rooms-${project.id}`}>
        {rooms.map((r) => (
          <option key={r.id} value={r.name} />
        ))}
      </datalist>
      {dirty && (
        <button
          onClick={() => {
            const m = rooms.find((r) => r.name === val);
            onSave(val.trim() || null, m?.homey_zone_id ?? null);
          }}
          className="mt-2 text-[10px] tracking-[0.3em] uppercase text-primary hover:underline"
        >
          Lagre rom
        </button>
      )}
    </div>
  );
}

function DatesAndBudget({
  project,
  onSave,
}: {
  project: Project;
  onSave: (p: Partial<Project>) => void;
}) {
  const [start, setStart] = useState(project.planned_start ?? "");
  const [end, setEnd] = useState(project.planned_end ?? "");
  const [budget, setBudget] = useState(String(project.budget_nok ?? ""));
  const dirty =
    start !== (project.planned_start ?? "") ||
    end !== (project.planned_end ?? "") ||
    budget !== String(project.budget_nok ?? "");

  return (
    <div>
      <SectionTitle>Plan & budsjett</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="rounded border border-border bg-background/60 px-2 py-1.5 text-xs"
        />
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="rounded border border-border bg-background/60 px-2 py-1.5 text-xs"
        />
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="Budsjett (NOK)"
          className="col-span-2 rounded border border-border bg-background/60 px-2 py-1.5 text-xs"
        />
      </div>
      {dirty && (
        <button
          onClick={() =>
            onSave({
              planned_start: start || null,
              planned_end: end || null,
              budget_nok: budget ? Number(budget) : 0,
            })
          }
          className="mt-2 text-[10px] tracking-[0.3em] uppercase text-primary hover:underline"
        >
          Lagre
        </button>
      )}
    </div>
  );
}

function CostsSection({
  projectId,
  costs,
  budget,
  onChange,
}: {
  projectId: string;
  costs: CostLine[];
  budget: number;
  onChange: () => void;
}) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState("materialer");
  const [busy, setBusy] = useState(false);

  const total = costs.reduce((s, c) => s + Number(c.amount_nok), 0);
  const overBudget = budget > 0 && total > budget;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!desc.trim() || !amount) return;
    setBusy(true);
    await supabase.from("renovation_costs").insert({
      project_id: projectId,
      description: desc.trim(),
      amount_nok: Number(amount),
      kind,
    });
    setDesc("");
    setAmount("");
    setBusy(false);
    onChange();
  }
  async function remove(id: string) {
    await supabase.from("renovation_costs").delete().eq("id", id);
    onChange();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <SectionTitle>Husets gull</SectionTitle>
        <span
          className={`text-[10px] tracking-wider ${overBudget ? "text-amber-400" : "text-primary"}`}
        >
          {formatNOK(total)}
          {budget > 0 && (
            <span className="text-muted-foreground"> / {formatNOK(budget)}</span>
          )}
        </span>
      </div>
      {costs.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic mb-2">Ingen kostnader registrert.</p>
      ) : (
        <ul className="flex flex-col gap-1 mb-2">
          {costs.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 text-xs border-b border-border/40 pb-1 group"
            >
              <span className="flex-1 truncate">
                {c.description}
                <span className="text-muted-foreground ml-2 text-[10px]">
                  · {c.kind} · {fmtDate(c.cost_date)}
                </span>
              </span>
              <span className="text-primary tabular-nums">{formatNOK(Number(c.amount_nok))}</span>
              <button
                onClick={() => remove(c.id)}
                className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid grid-cols-12 gap-1.5">
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Beskrivelse"
          className="col-span-5 rounded border border-border bg-background/60 px-2 py-1.5 text-xs"
        />
        <input
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="kr"
          className="col-span-3 rounded border border-border bg-background/60 px-2 py-1.5 text-xs"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="col-span-3 rounded border border-border bg-background/60 px-1 py-1.5 text-xs"
        >
          <option value="materialer">Mat.</option>
          <option value="arbeid">Arb.</option>
          <option value="leie">Leie</option>
          <option value="annet">Annet</option>
        </select>
        <button
          type="submit"
          disabled={busy || !desc.trim() || !amount}
          className="col-span-1 rounded border border-primary/50 text-primary hover:bg-primary/10 disabled:opacity-40 flex items-center justify-center"
        >
          <Plus size={12} />
        </button>
      </form>
    </div>
  );
}

function ContractorsSection({
  projectId,
  contractors,
  onChange,
}: {
  projectId: string;
  contractors: Contractor[];
  onChange: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await supabase.from("renovation_contractors").insert({
      project_id: projectId,
      name: name.trim(),
      role: role.trim() || null,
      phone: phone.trim() || null,
    });
    setName("");
    setRole("");
    setPhone("");
    setBusy(false);
    onChange();
  }
  async function remove(id: string) {
    await supabase.from("renovation_contractors").delete().eq("id", id);
    onChange();
  }

  return (
    <div>
      <SectionTitle>Husets håndverkere</SectionTitle>
      {contractors.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic mb-2">Ingen registrert ennå.</p>
      ) : (
        <ul className="flex flex-col gap-1 mb-2">
          {contractors.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 text-xs border-b border-border/40 pb-1 group"
            >
              <UserPlus size={11} className="text-primary/70" />
              <span className="flex-1 truncate">
                <strong className="text-foreground">{c.name}</strong>
                {c.role && <span className="text-muted-foreground"> · {c.role}</span>}
                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    className="text-primary ml-2 hover:underline"
                  >
                    {c.phone}
                  </a>
                )}
              </span>
              <button
                onClick={() => remove(c.id)}
                className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid grid-cols-12 gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Navn"
          className="col-span-4 rounded border border-border bg-background/60 px-2 py-1.5 text-xs"
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Rolle"
          className="col-span-4 rounded border border-border bg-background/60 px-2 py-1.5 text-xs"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Tlf"
          className="col-span-3 rounded border border-border bg-background/60 px-2 py-1.5 text-xs"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="col-span-1 rounded border border-primary/50 text-primary hover:bg-primary/10 disabled:opacity-40 flex items-center justify-center"
        >
          <Plus size={12} />
        </button>
      </form>
    </div>
  );
}

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("no-NO", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return d;
  }
}
