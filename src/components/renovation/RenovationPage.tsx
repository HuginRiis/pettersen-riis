import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getHomeyRooms, syncHomeyRooms, type HomeyRoom } from "@/server/renovation";
import { PageShell, PageHero } from "@/components/PageShell";
import { Hammer, Plus, RefreshCw, X, Filter } from "lucide-react";
import {
  ALL_CATEGORIES,
  ALL_PRIORITIES,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type CostLine,
  type Contractor,
  type Project,
  type ProjectCategory,
  type ProjectImage,
  type ProjectPriority,
  type ProjectStatus,
  type RenovationLocation,
  type Task,
} from "./types";
import { ProjectCard } from "./ProjectCard";
import { NewProjectForm } from "./NewProjectForm";

export type RenovationPageProps = {
  location: RenovationLocation;
  hero: { eyebrow: string; title: string; subtitle: string; image: string };
  emptyTitle: string;
  emptyHint: string;
};

const STATUS_COLUMNS: ProjectStatus[] = ["planlagt", "pagaende", "ferdig"];

export function RenovationPage({ location, hero, emptyTitle, emptyHint }: RenovationPageProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [costs, setCosts] = useState<CostLine[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [rooms, setRooms] = useState<HomeyRoom[]>([]);
  const [lastRoomSync, setLastRoomSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [syncingRooms, setSyncingRooms] = useState(false);

  const [filterRoom, setFilterRoom] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<ProjectCategory | "">("");
  const [filterPriority, setFilterPriority] = useState<ProjectPriority | "">("");

  const getRooms = useServerFn(getHomeyRooms);
  const syncRooms = useServerFn(syncHomeyRooms);

  async function loadAll() {
    setLoading(true);
    const { data: projData } = await supabase
      .from("renovation_projects")
      .select("*")
      .eq("location", location)
      .order("created_at", { ascending: false });
    const projs = (projData ?? []) as Project[];
    setProjects(projs);

    if (projs.length > 0) {
      const ids = projs.map((p) => p.id);
      const [{ data: taskData }, { data: imgData }, { data: costData }, { data: contData }] =
        await Promise.all([
          supabase.from("renovation_tasks").select("*").in("project_id", ids).order("sort_order"),
          supabase.from("renovation_images").select("*").in("project_id", ids).order("sort_order"),
          supabase
            .from("renovation_costs")
            .select("*")
            .in("project_id", ids)
            .order("cost_date", { ascending: false }),
          supabase.from("renovation_contractors").select("*").in("project_id", ids),
        ]);
      setTasks((taskData ?? []) as Task[]);
      setImages((imgData ?? []) as ProjectImage[]);
      setCosts((costData ?? []) as CostLine[]);
      setContractors((contData ?? []) as Contractor[]);
    } else {
      setTasks([]);
      setImages([]);
      setCosts([]);
      setContractors([]);
    }
    setLoading(false);
  }

  async function loadRooms() {
    try {
      const r = await getRooms({ data: { location } });
      setRooms(r.rooms);
      setLastRoomSync(r.lastSync);
    } catch {
      setRooms([]);
    }
  }

  async function handleSyncRooms() {
    setSyncingRooms(true);
    try {
      const r = await syncRooms({ data: { location } });
      setRooms(r.rooms);
      setLastRoomSync(r.lastSync);
    } finally {
      setSyncingRooms(false);
    }
  }

  useEffect(() => {
    loadAll();
    loadRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const filtered = projects.filter((p) => {
    if (filterRoom && p.room_name !== filterRoom) return false;
    if (filterCategory && p.category !== filterCategory) return false;
    if (filterPriority && p.priority !== filterPriority) return false;
    return true;
  });

  const totalBudget = filtered.reduce((s, p) => s + Number(p.budget_nok ?? 0), 0);
  const totalSpent = filtered.reduce((s, p) => {
    const projectCosts = costs.filter((c) => c.project_id === p.id);
    return s + projectCosts.reduce((cs, c) => cs + Number(c.amount_nok), 0);
  }, 0);

  const hasFilter = filterRoom || filterCategory || filterPriority;

  return (
    <PageShell>
      <PageHero
        eyebrow={hero.eyebrow}
        title={hero.title}
        subtitle={hero.subtitle}
        image={hero.image}
      />

      <section className="container mx-auto px-4 py-8">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div className="ornate-divider flex-1 min-w-[180px]">
            <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
              Husets byggverk
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSyncRooms}
              disabled={syncingRooms}
              className="px-3 py-2 rounded border border-border text-muted-foreground text-[10px] tracking-[0.3em] uppercase hover:text-primary hover:border-primary/50 flex items-center gap-2 disabled:opacity-50"
              title={
                lastRoomSync
                  ? `Sist synket ${new Date(lastRoomSync).toLocaleString("no-NO")}`
                  : "Hent rom fra Homey"
              }
            >
              <RefreshCw size={12} className={syncingRooms ? "animate-spin" : ""} />
              {syncingRooms ? "Synker…" : `Rom (${rooms.length})`}
            </button>
            <button
              onClick={() => setShowNew((v) => !v)}
              className="px-4 py-2 rounded border border-primary/50 text-primary text-[11px] tracking-[0.3em] uppercase hover:bg-primary/10 flex items-center gap-2"
            >
              {showNew ? <X size={14} /> : <Plus size={14} />}
              {showNew ? "Lukk" : "Nytt prosjekt"}
            </button>
          </div>
        </div>

        {/* Stats */}
        {projects.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatBox label="Prosjekter" value={String(filtered.length)} />
            <StatBox
              label="Pågående"
              value={String(filtered.filter((p) => p.status === "pagaende").length)}
            />
            <StatBox label="Budsjett" value={formatNOK(totalBudget)} />
            <StatBox
              label="Brukt"
              value={formatNOK(totalSpent)}
              tone={totalSpent > totalBudget && totalBudget > 0 ? "warn" : "default"}
            />
          </div>
        )}

        {/* Filters */}
        {projects.length > 0 && (
          <div className="panel rounded-lg p-3 mb-5 flex items-center gap-2 flex-wrap">
            <Filter size={14} className="text-muted-foreground" />
            <select
              value={filterRoom}
              onChange={(e) => setFilterRoom(e.target.value)}
              className="rounded border border-border bg-background/60 px-2 py-1 text-xs"
            >
              <option value="">Alle rom</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
              {/* Inkluder rom som er brukt på prosjekter, men ikke i Homey-listen */}
              {Array.from(
                new Set(
                  projects
                    .map((p) => p.room_name)
                    .filter((n): n is string => !!n && !rooms.some((r) => r.name === n)),
                ),
              ).map((n) => (
                <option key={`extra-${n}`} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as ProjectCategory | "")}
              className="rounded border border-border bg-background/60 px-2 py-1 text-xs"
            >
              <option value="">Alle kategorier</option>
              {ALL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value as ProjectPriority | "")}
              className="rounded border border-border bg-background/60 px-2 py-1 text-xs"
            >
              <option value="">Alle prioriteter</option>
              {ALL_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
            {hasFilter && (
              <button
                onClick={() => {
                  setFilterRoom("");
                  setFilterCategory("");
                  setFilterPriority("");
                }}
                className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground hover:text-primary ml-auto"
              >
                Tøm filter
              </button>
            )}
          </div>
        )}

        {showNew && (
          <NewProjectForm
            location={location}
            rooms={rooms}
            onCreated={() => {
              setShowNew(false);
              loadAll();
            }}
          />
        )}

        {loading ? (
          <p className="text-muted-foreground italic text-sm">Henter krønikene…</p>
        ) : projects.length === 0 ? (
          <div className="panel rounded-lg p-8 text-center">
            <Hammer className="mx-auto mb-3 text-primary/60" size={28} />
            <h3 className="text-lg text-primary">{emptyTitle}</h3>
            <p className="text-sm text-muted-foreground mt-2 italic">{emptyHint}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {STATUS_COLUMNS.map((col) => {
              const colProjects = filtered.filter((p) => p.status === col);
              return (
                <div key={col} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] tracking-[0.3em] uppercase text-primary">
                      {STATUS_LABEL[col]}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {colProjects.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3 min-h-[100px]">
                    {colProjects.length === 0 ? (
                      <div className="rounded border border-dashed border-border/60 p-4 text-center text-[11px] text-muted-foreground italic">
                        Ingen
                      </div>
                    ) : (
                      colProjects.map((p) => (
                        <ProjectCard
                          key={p.id}
                          project={p}
                          tasks={tasks.filter((t) => t.project_id === p.id)}
                          images={images.filter((i) => i.project_id === p.id)}
                          costs={costs.filter((c) => c.project_id === p.id)}
                          contractors={contractors.filter((c) => c.project_id === p.id)}
                          rooms={rooms}
                          onChange={loadAll}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </PageShell>
  );
}

function StatBox({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className={`panel rounded-lg p-3 ${tone === "warn" ? "border-amber-500/40" : ""}`}
    >
      <div className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground">{label}</div>
      <div
        className={`text-lg font-display mt-1 ${tone === "warn" ? "text-amber-400" : "text-primary"}`}
      >
        {value}
      </div>
    </div>
  );
}

export function formatNOK(n: number): string {
  return new Intl.NumberFormat("no-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(n);
}
