import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, PageHero } from "@/components/PageShell";
import { Plus, Trash2, Check, Image as ImageIcon, Hammer, X } from "lucide-react";

type Project = {
  id: string;
  location: "borg" | "hytta";
  title: string;
  description: string | null;
  status: "planlagt" | "pagaende" | "ferdig";
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
};

type Task = {
  id: string;
  project_id: string;
  label: string;
  done: boolean;
  sort_order: number;
};

type ProjectImage = {
  id: string;
  project_id: string;
  url: string;
  caption: string | null;
  sort_order: number;
};

const STATUS_LABEL: Record<Project["status"], string> = {
  planlagt: "Planlagt",
  pagaende: "Pågående",
  ferdig: "Ferdig",
};

const STATUS_TONE: Record<Project["status"], string> = {
  planlagt: "border-muted-foreground/40 text-muted-foreground",
  pagaende: "border-primary/60 text-primary",
  ferdig: "border-emerald-500/60 text-emerald-400",
};

export type RenovationPageProps = {
  location: "borg" | "hytta";
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    image: string;
  };
  emptyTitle: string;
  emptyHint: string;
};

export function RenovationPage({ location, hero, emptyTitle, emptyHint }: RenovationPageProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

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
      const [{ data: taskData }, { data: imgData }] = await Promise.all([
        supabase.from("renovation_tasks").select("*").in("project_id", ids).order("sort_order"),
        supabase.from("renovation_images").select("*").in("project_id", ids).order("sort_order"),
      ]);
      setTasks((taskData ?? []) as Task[]);
      setImages((imgData ?? []) as ProjectImage[]);
    } else {
      setTasks([]);
      setImages([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return (
    <PageShell>
      <PageHero
        eyebrow={hero.eyebrow}
        title={hero.title}
        subtitle={hero.subtitle}
        image={hero.image}
      />

      <section className="container mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div className="ornate-divider flex-1 min-w-[200px]">
            <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
              Husets byggverk
            </span>
          </div>
          <button
            onClick={() => setShowNew((v) => !v)}
            className="px-4 py-2 rounded border border-primary/50 text-primary text-[11px] tracking-[0.3em] uppercase hover:bg-primary/10 flex items-center gap-2"
          >
            {showNew ? <X size={14} /> : <Plus size={14} />}
            {showNew ? "Lukk" : "Nytt prosjekt"}
          </button>
        </div>

        {showNew && (
          <NewProjectForm
            location={location}
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
          <div className="grid gap-6 md:grid-cols-2">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                tasks={tasks.filter((t) => t.project_id === p.id)}
                images={images.filter((i) => i.project_id === p.id)}
                onChange={loadAll}
              />
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}

/* ---------------------- New project form ---------------------- */

function NewProjectForm({
  location,
  onCreated,
}: {
  location: "borg" | "hytta";
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Project["status"]>("planlagt");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("renovation_projects").insert({
      location,
      title: title.trim(),
      description: description.trim() || null,
      status,
    });
    setBusy(false);
    if (!error) {
      setTitle("");
      setDescription("");
      setStatus("planlagt");
      onCreated();
    }
  }

  return (
    <form
      onSubmit={submit}
      className="panel rounded-lg p-5 mb-6 grid gap-3 md:grid-cols-2"
    >
      <div className="md:col-span-2">
        <label className="block text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-1">
          Tittel
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="F.eks. «Nytt tak over storsalen»"
          className="w-full rounded border border-border bg-background/60 px-3 py-2 text-sm"
          required
        />
      </div>
      <div className="md:col-span-2">
        <label className="block text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-1">
          Beskrivelse
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Hva skal gjøres? Hvilke materialer, hvem hjelper til…"
          className="w-full rounded border border-border bg-background/60 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-1">
          Status
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Project["status"])}
          className="w-full rounded border border-border bg-background/60 px-3 py-2 text-sm"
        >
          <option value="planlagt">Planlagt</option>
          <option value="pagaende">Pågående</option>
          <option value="ferdig">Ferdig</option>
        </select>
      </div>
      <div className="flex items-end">
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

/* ---------------------- Project card ---------------------- */

function ProjectCard({
  project,
  tasks,
  images,
  onChange,
}: {
  project: Project;
  tasks: Task[];
  images: ProjectImage[];
  onChange: () => void;
}) {
  const [newTask, setNewTask] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function toggleTask(t: Task) {
    await supabase.from("renovation_tasks").update({ done: !t.done }).eq("id", t.id);
    onChange();
  }
  async function deleteTask(id: string) {
    await supabase.from("renovation_tasks").delete().eq("id", id);
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
  async function changeStatus(s: Project["status"]) {
    await supabase.from("renovation_projects").update({ status: s }).eq("id", project.id);
    onChange();
  }
  async function deleteProject() {
    if (!confirm(`Slette «${project.title}»?`)) return;
    await supabase.from("renovation_projects").delete().eq("id", project.id);
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
      // sett som cover hvis prosjektet ikke har bilde
      if (!project.cover_image_url) {
        await supabase
          .from("renovation_projects")
          .update({ cover_image_url: pub.publicUrl })
          .eq("id", project.id);
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    onChange();
  }
  async function deleteImage(img: ProjectImage) {
    // Hent path ut av URL
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

  const doneCount = tasks.filter((t) => t.done).length;
  const progress = tasks.length === 0 ? 0 : Math.round((doneCount / tasks.length) * 100);

  return (
    <article className="panel rounded-lg overflow-hidden glow-on-hover flex flex-col">
      {project.cover_image_url ? (
        <div className="aspect-[16/9] overflow-hidden border-b border-border">
          <img
            src={project.cover_image_url}
            alt={project.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="aspect-[16/9] flex items-center justify-center border-b border-border bg-muted/20">
          <ImageIcon className="text-muted-foreground/40" size={36} />
        </div>
      )}

      <div className="p-5 flex flex-col gap-4 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg text-primary leading-tight">{project.title}</h3>
            {project.description && (
              <p className="text-sm text-muted-foreground mt-1 leading-snug">
                {project.description}
              </p>
            )}
          </div>
          <button
            onClick={deleteProject}
            className="text-muted-foreground hover:text-destructive shrink-0"
            aria-label="Slett prosjekt"
            title="Slett prosjekt"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Status + framdrift */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={project.status}
            onChange={(e) => changeStatus(e.target.value as Project["status"])}
            className={`px-2 py-1 rounded border bg-background/60 text-[10px] tracking-[0.3em] uppercase ${STATUS_TONE[project.status]}`}
          >
            <option value="planlagt">{STATUS_LABEL.planlagt}</option>
            <option value="pagaende">{STATUS_LABEL.pagaende}</option>
            <option value="ferdig">{STATUS_LABEL.ferdig}</option>
          </select>
          <div className="flex-1 min-w-[120px]">
            <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 tracking-widest">
              {doneCount}/{tasks.length} hugget i stein · {progress}%
            </div>
          </div>
        </div>

        {/* Sjekkliste */}
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
            Husets plan
          </div>
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
                  aria-label={t.done ? "Fjern hake" : "Hak av"}
                >
                  {t.done && <Check size={12} />}
                </button>
                <span
                  className={`text-sm flex-1 ${
                    t.done ? "line-through text-muted-foreground" : "text-foreground"
                  }`}
                >
                  {t.label}
                </span>
                <button
                  onClick={() => deleteTask(t.id)}
                  className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                  aria-label="Slett oppgave"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={addTask} className="flex gap-2 mt-3">
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

        {/* Bilder */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
              Lerret
            </div>
            <label className="text-[10px] tracking-[0.3em] uppercase text-primary hover:underline cursor-pointer">
              + Legg til
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && uploadImages(e.target.files)}
              />
            </label>
          </div>
          {images.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">Ingen bilder ennå.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {images.map((img) => (
                <div key={img.id} className="relative group aspect-square overflow-hidden rounded border border-border">
                  <img
                    src={img.url}
                    alt={img.caption ?? ""}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <button
                    onClick={() => deleteImage(img)}
                    className="absolute top-1 right-1 bg-background/80 rounded p-1 text-destructive opacity-0 group-hover:opacity-100"
                    aria-label="Slett bilde"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
