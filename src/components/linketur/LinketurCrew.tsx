import { useRef, useState } from "react";
import { LAN_MODE_LABEL, LAN_MODE_COLOR } from "@/lib/lan-games";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { compressImageToWebp } from "@/lib/image-compress";
import {
  LINKETUR_CABINS,
  LINKETUR_CREW,
  CREW_GAMES,
} from "@/lib/linketur-crew";
import {
  Home,
  KeyRound,
  Users,
  Cpu,
  MonitorSmartphone,
  HardDrive,
  MemoryStick,
  Gamepad2,
  Eye,
  EyeOff,
  Pencil,
  Check,
  ImagePlus,
  X,
} from "lucide-react";

type CabinEdit = {
  name?: string;
  code?: string;
  number?: string;
  facts?: { label: string; value: string }[];
};
type CrewEdit = {
  pc?: string;
  photo?: string;
  pcPhoto?: string;
  specs?: Partial<{ cpu: string; gpu: string; ram: string; disk: string; skjerm: string }>;
};

async function fileToDataUrl(file: File): Promise<string> {
  const small = await compressImageToWebp(file, { maxDim: 640, quality: 0.7 });
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(small);
  });
}

export function LinketurCrew() {
  const [showCode, setShowCode] = useState<Record<string, boolean>>({});
  const [editCabin, setEditCabin] = useState<Record<string, boolean>>({});
  const [editCrew, setEditCrew] = useState<Record<string, boolean>>({});
  const [cabinEdits, setCabinEdits] = usePersistedState<Record<string, CabinEdit>>(
    "linketur:cabins",
    {},
  );
  const [crewEdits, setCrewEdits] = usePersistedState<Record<string, CrewEdit>>(
    "linketur:crew",
    {},
  );
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  const patchCabin = (id: string, patch: CabinEdit) =>
    setCabinEdits((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  const patchCrew = (name: string, patch: CrewEdit) =>
    setCrewEdits((p) => ({ ...p, [name]: { ...p[name], ...patch } }));

  return (
    <div className="space-y-8">
      {/* Hyttene */}
      <section className="space-y-3">
        <h2 className="text-xl text-foreground inline-flex items-center gap-2">
          <Home size={18} className="text-primary" /> Hyttene vi er på
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {LINKETUR_CABINS.map((c) => {
            const e = cabinEdits[c.id] ?? {};
            const name = e.name ?? c.name;
            const code = e.code ?? c.code;
            const number = e.number ?? c.number;
            const facts = e.facts ?? c.facts;
            const editing = !!editCabin[c.id];
            return (
              <article
                key={c.id}
                className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
              >
                <div className="relative h-44 overflow-hidden">
                  <img
                    src={c.image}
                    alt={`${name} på ${c.place}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                  <div className="absolute bottom-3 left-4">
                    <h3 className="text-lg text-foreground">{name}</h3>
                    <div className="text-xs text-muted-foreground">
                      {c.place}
                      {number ? ` · hytte nr. ${number}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => setEditCabin((p) => ({ ...p, [c.id]: !p[c.id] }))}
                    aria-label={editing ? `Ferdig med ${name}` : `Rediger ${name}`}
                    className="absolute right-3 top-3 rounded-lg border border-border bg-background/70 p-1.5 text-muted-foreground backdrop-blur hover:text-foreground"
                  >
                    {editing ? <Check size={14} /> : <Pencil size={14} />}
                  </button>
                </div>
                <div className="space-y-3 p-4">
                  {editing && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <EditField
                        label="Navn"
                        value={name}
                        onChange={(v) => patchCabin(c.id, { name: v })}
                      />
                      <EditField
                        label="Hyttenummer"
                        value={number}
                        onChange={(v) => patchCabin(c.id, { number: v })}
                      />
                      <EditField
                        label="Kode til turen"
                        value={code}
                        onChange={(v) => patchCabin(c.id, { code: v })}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {facts.map((f, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-border bg-background/60 p-2"
                      >
                        {editing ? (
                          <div className="space-y-1">
                            <input
                              value={f.label}
                              onChange={(ev) => {
                                const next = facts.map((x, j) =>
                                  j === i ? { ...x, label: ev.target.value } : x,
                                );
                                patchCabin(c.id, { facts: next });
                              }}
                              className="w-full rounded bg-transparent text-[10px] uppercase tracking-wider text-muted-foreground outline-none focus:bg-muted/40"
                              aria-label={`Tittel boks ${i + 1}`}
                            />
                            <input
                              value={f.value}
                              onChange={(ev) => {
                                const next = facts.map((x, j) =>
                                  j === i ? { ...x, value: ev.target.value } : x,
                                );
                                patchCabin(c.id, { facts: next });
                              }}
                              className="w-full rounded bg-transparent text-xs text-foreground outline-none focus:bg-muted/40"
                              aria-label={`Verdi boks ${i + 1}`}
                            />
                          </div>
                        ) : (
                          <>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {f.label}
                            </div>
                            <div className="text-xs text-foreground">{f.value}</div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowCode((p) => ({ ...p, [c.id]: !p[c.id] }))}
                    className="inline-flex w-full items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground"
                    aria-label={`Vis kode for ${name}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <KeyRound size={14} className="text-primary" /> Kode til turen
                    </span>
                    <span className="inline-flex items-center gap-2 font-mono tracking-widest">
                      {showCode[c.id] ? code : "••••"}
                      {showCode[c.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Gjengen + PC-er */}
      <section className="space-y-3">
        <h2 className="text-xl text-foreground inline-flex items-center gap-2">
          <Users size={18} className="text-primary" /> Gjengen og riggene ({LINKETUR_CREW.length})
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {LINKETUR_CREW.map((m) => {
            const e = crewEdits[m.name] ?? {};
            const pc = e.pc ?? m.pc;
            const editing = !!editCrew[m.name];
            return (
              <div
                key={m.name}
                className="rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/50"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-base text-foreground">{m.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
                      {m.role}
                    </span>
                    <button
                      onClick={() => setEditCrew((p) => ({ ...p, [m.name]: !p[m.name] }))}
                      aria-label={editing ? `Ferdig med ${m.name}` : `Rediger ${m.name}`}
                      className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground"
                    >
                      {editing ? <Check size={12} /> : <Pencil size={12} />}
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <PhotoSlot
                    src={e.photo}
                    alt={`Bilde av ${m.name}`}
                    label="Person"
                    editing={editing}
                    onPick={(src) => patchCrew(m.name, { photo: src })}
                    onClear={() => patchCrew(m.name, { photo: undefined })}
                    onOpen={setLightbox}
                  />
                  <PhotoSlot
                    src={e.pcPhoto}
                    alt={`Bilde av PC-en til ${m.name}`}
                    label="PC"
                    editing={editing}
                    onPick={(src) => patchCrew(m.name, { pcPhoto: src })}
                    onClear={() => patchCrew(m.name, { pcPhoto: undefined })}
                    onOpen={setLightbox}
                  />
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <EditField
                        label="Type PC"
                        value={pc}
                        onChange={(v) => patchCrew(m.name, { pc: v })}
                      />
                    ) : (
                      <div className="truncate text-xs text-muted-foreground">{pc}</div>
                    )}
                  </div>
                </div>

                <dl className="mt-3 space-y-1.5 text-xs">
                  <SpecRow icon={<Cpu size={12} />} label="CPU" value={m.specs.cpu} />
                  <SpecRow icon={<Gamepad2 size={12} />} label="GPU" value={m.specs.gpu} />
                  <SpecRow icon={<MemoryStick size={12} />} label="RAM" value={m.specs.ram} />
                  <SpecRow icon={<HardDrive size={12} />} label="Disk" value={m.specs.disk} />
                  <SpecRow
                    icon={<MonitorSmartphone size={12} />}
                    label="Skjerm"
                    value={m.specs.skjerm}
                  />
                </dl>
                {m.note && <p className="mt-3 text-[11px] text-muted-foreground">{m.note}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Spillene vi faktisk spiller */}
      <section className="space-y-3">
        <h2 className="text-xl text-foreground inline-flex items-center gap-2">
          <Gamepad2 size={18} className="text-primary" /> LAN-spillene vi spiller
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CREW_GAMES.map((g) => {
            const color = LAN_MODE_COLOR[g.mode];
            return (
              <div key={g.title} className="relative overflow-hidden rounded-lg border border-border bg-card p-4">
                <div
                  className="absolute inset-x-0 top-0 h-0.5 opacity-70"
                  style={{ backgroundColor: color }}
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium text-foreground">{g.title}</div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px]"
                    style={{ backgroundColor: `${color}22`, color }}
                  >
                    {LAN_MODE_LABEL[g.mode]}
                  </span>
                </div>
                <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Users size={12} /> {g.players}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{g.special}</p>
              </div>
            );
          })}
        </div>
      </section>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-label={lightbox.alt}
        >
          <img
            src={lightbox.src}
            alt={lightbox.alt}
            className="max-h-[85vh] max-w-full rounded-xl border border-border object-contain"
          />
          <button
            onClick={() => setLightbox(null)}
            aria-label="Lukk bilde"
            className="absolute right-4 top-4 rounded-lg border border-border bg-card p-2 text-foreground"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-md border border-border bg-background/60 px-2 py-1 text-xs text-foreground outline-none focus:border-primary/60"
      />
    </label>
  );
}

function PhotoSlot({
  src,
  alt,
  label,
  editing,
  onPick,
  onClear,
  onOpen,
}: {
  src?: string;
  alt: string;
  label: string;
  editing: boolean;
  onPick: (src: string) => void;
  onClear: () => void;
  onOpen: (v: { src: string; alt: string }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (!src) {
    if (!editing) return null;
    return (
      <>
        <button
          onClick={() => inputRef.current?.click()}
          aria-label={`Legg til bilde: ${label}`}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/60 hover:text-foreground"
        >
          <ImagePlus size={14} />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) onPick(await fileToDataUrl(f));
            e.target.value = "";
          }}
        />
      </>
    );
  }

  return (
    <div className="relative h-12 w-12 shrink-0">
      <img
        src={src}
        alt={alt}
        onClick={() => onOpen({ src, alt })}
        className="h-12 w-12 cursor-zoom-in rounded-lg border border-border object-cover"
      />
      {editing && (
        <button
          onClick={onClear}
          aria-label={`Fjern bilde: ${label}`}
          className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-card p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

function SpecRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
        {icon} {label}
      </dt>
      <dd className="text-foreground/90">{value}</dd>
    </div>
  );
}
