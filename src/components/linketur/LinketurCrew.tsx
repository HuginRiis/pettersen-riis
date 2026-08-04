import { useRef, useState } from "react";
import { LAN_MODE_LABEL, LAN_MODE_COLOR } from "@/lib/lan-games";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { compressImageToWebp } from "@/lib/image-compress";
import { LINKETUR_CABINS, LINKETUR_CREW, CREW_GAMES } from "@/lib/linketur-crew";
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
  Map as MapIcon,
  Info,
  Car,
  Cable,
  User as UserIcon,
} from "lucide-react";

import kartAsset from "@/assets/hydrostranda-kart.jpg.asset.json";

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
  carPhoto?: string;
  /** Frie bilder lagt til i personmodalen */
  photos?: string[];
  specs?: Partial<{ cpu: string; gpu: string; ram: string; disk: string; skjerm: string }>;
  porsche?: string;
  porscheColor?: string;
  cable?: string;
  cableColor?: string;
  drikke?: string;
  hjemsted?: string;
  info?: string;
  // Utvidede detaljer
  nickname?: string;
  tripRole?: string;
  gamertag?: string;
  steamId?: string;
  discord?: string;
  phone?: string;
  arrival?: string;
  transport?: string;
  about?: string;
  favGames?: string;
  food?: string;
  brings?: string;
  notes?: string;
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

export type LinketurSection = "hytter" | "personer" | "spill";

export function LinketurCrew({ section = "hytter" }: { section?: LinketurSection }) {
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
  const [openPerson, setOpenPerson] = useState<string | null>(null);

  const patchCabin = (id: string, patch: CabinEdit) =>
    setCabinEdits((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  const patchCrew = (name: string, patch: CrewEdit) =>
    setCrewEdits((p) => ({ ...p, [name]: { ...p[name], ...patch } }));

  return (
    <div className="space-y-8">
      {/* Hyttene */}
      {section === "hytter" && (
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
      )}

      {/* Gjengen + PC-er */}
      {section === "personer" && (
        <section className="space-y-3">
          <h2 className="text-xl text-foreground inline-flex items-center gap-2">
            <Users size={18} className="text-primary" /> Gjengen og riggene ({LINKETUR_CREW.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Klikk på navnet for full profil — bilder, kontakt, reise, favorittspill og notater.
          </p>
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
                    <button
                      onClick={() => setOpenPerson(m.name)}
                      className="group inline-flex items-center gap-1.5 text-base text-foreground hover:text-primary"
                      aria-label={`Mer info om ${m.name}`}
                    >
                      <h3 className="text-base">{m.name}</h3>
                      {e.nickname && (
                        <span className="text-[11px] text-muted-foreground">«{e.nickname}»</span>
                      )}
                      <Info size={13} className="text-muted-foreground group-hover:text-primary" />
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
                        {e.tripRole || m.role}
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
                    {(
                      [
                        ["cpu", "CPU", <Cpu size={12} key="c" />],
                        ["gpu", "GPU", <Gamepad2 size={12} key="g" />],
                        ["ram", "RAM", <MemoryStick size={12} key="r" />],
                        ["disk", "Disk", <HardDrive size={12} key="d" />],
                        ["skjerm", "Skjerm", <MonitorSmartphone size={12} key="s" />],
                      ] as const
                    ).map(([key, label, icon]) => {
                      const value = e.specs?.[key] ?? m.specs[key];
                      return editing ? (
                        <EditField
                          key={key}
                          label={label}
                          value={value}
                          onChange={(v) => patchCrew(m.name, { specs: { ...e.specs, [key]: v } })}
                        />
                      ) : (
                        <SpecRow key={key} icon={icon} label={label} value={value} />
                      );
                    })}
                  </dl>
                  {m.note && <p className="mt-3 text-[11px] text-muted-foreground">{m.note}</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Spillene vi faktisk spiller */}
      {section === "spill" && (
        <section className="space-y-3">
          <h2 className="text-xl text-foreground inline-flex items-center gap-2">
            <Gamepad2 size={18} className="text-primary" /> LAN-spillene vi spiller
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CREW_GAMES.map((g) => {
              const color = LAN_MODE_COLOR[g.mode];
              return (
                <div
                  key={g.title}
                  className="relative overflow-hidden rounded-lg border border-border bg-card p-4"
                >
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
      )}

      {openPerson &&
        (() => {
          const m = LINKETUR_CREW.find((x) => x.name === openPerson);
          if (!m) return null;
          const e = crewEdits[m.name] ?? {};
          const gallery = e.photos ?? [];
          return (
            <div
              className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/90 p-4 backdrop-blur"
              role="dialog"
              aria-label={`Info om ${m.name}`}
              onClick={() => setOpenPerson(null)}
            >
              <div
                onClick={(ev) => ev.stopPropagation()}
                className="my-8 w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex items-center gap-2">
                    <UserIcon size={18} className="text-primary" />
                    <div>
                      <h3 className="text-xl uppercase tracking-wide text-foreground">{m.name}</h3>
                      <div className="text-xs text-primary">{e.tripRole || m.role}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setOpenPerson(null)}
                    aria-label="Lukk"
                    className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <PhotoSlot
                    src={e.photo}
                    alt={`Bilde av ${m.name}`}
                    label="Person"
                    editing
                    onPick={(src) => patchCrew(m.name, { photo: src })}
                    onClear={() => patchCrew(m.name, { photo: undefined })}
                    onOpen={setLightbox}
                  />
                  <PhotoSlot
                    src={e.pcPhoto}
                    alt={`PC-en til ${m.name}`}
                    label="PC"
                    editing
                    onPick={(src) => patchCrew(m.name, { pcPhoto: src })}
                    onClear={() => patchCrew(m.name, { pcPhoto: undefined })}
                    onOpen={setLightbox}
                  />
                  <PhotoSlot
                    src={e.carPhoto}
                    alt={`Bilen til ${m.name}`}
                    label="Bil"
                    editing
                    onPick={(src) => patchCrew(m.name, { carPhoto: src })}
                    onClear={() => patchCrew(m.name, { carPhoto: undefined })}
                    onOpen={setLightbox}
                  />
                  {gallery.map((src, i) => (
                    <PhotoSlot
                      key={i}
                      src={src}
                      alt={`Bilde ${i + 1} av ${m.name}`}
                      label={`Bilde ${i + 1}`}
                      editing
                      onPick={() => {}}
                      onClear={() =>
                        patchCrew(m.name, { photos: gallery.filter((_, j) => j !== i) })
                      }
                      onOpen={setLightbox}
                    />
                  ))}
                </div>

                <MultiPhotoPicker
                  onAdd={(srcs) => patchCrew(m.name, { photos: [...gallery, ...srcs] })}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <EditField
                    label="Kallenavn"
                    value={e.nickname ?? ""}
                    onChange={(v) => patchCrew(m.name, { nickname: v })}
                  />
                  <EditField
                    label="Rolle på turen"
                    value={e.tripRole ?? m.role}
                    onChange={(v) => patchCrew(m.name, { tripRole: v })}
                  />
                  <EditField
                    label="Gamertag"
                    value={e.gamertag ?? ""}
                    onChange={(v) => patchCrew(m.name, { gamertag: v })}
                  />
                  <EditField
                    label="Steam-ID"
                    value={e.steamId ?? ""}
                    onChange={(v) => patchCrew(m.name, { steamId: v })}
                  />
                  <EditField
                    label="Discord"
                    value={e.discord ?? ""}
                    onChange={(v) => patchCrew(m.name, { discord: v })}
                  />
                  <EditField
                    label="Telefon"
                    value={e.phone ?? ""}
                    onChange={(v) => patchCrew(m.name, { phone: v })}
                  />
                  <EditField
                    label="Ankomst / reise"
                    value={e.arrival ?? ""}
                    onChange={(v) => patchCrew(m.name, { arrival: v })}
                  />
                  <EditField
                    label="Bil / transport"
                    value={e.transport ?? ""}
                    onChange={(v) => patchCrew(m.name, { transport: v })}
                  />
                  <EditField
                    label="Hjemsted"
                    value={e.hjemsted ?? ""}
                    onChange={(v) => patchCrew(m.name, { hjemsted: v })}
                  />
                  <EditField
                    label="Fast drikke"
                    value={e.drikke ?? ""}
                    onChange={(v) => patchCrew(m.name, { drikke: v })}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <ColorField
                    icon={<Car size={13} className="text-primary" />}
                    label="Porsche"
                    text={e.porsche ?? ""}
                    color={e.porscheColor ?? "#d1d5db"}
                    onText={(v) => patchCrew(m.name, { porsche: v })}
                    onColor={(v) => patchCrew(m.name, { porscheColor: v })}
                  />
                  <ColorField
                    icon={<Cable size={13} className="text-primary" />}
                    label="Nettverkskabel"
                    text={e.cable ?? ""}
                    color={e.cableColor ?? "#22c55e"}
                    onText={(v) => patchCrew(m.name, { cable: v })}
                    onColor={(v) => patchCrew(m.name, { cableColor: v })}
                  />
                </div>

                <TextArea
                  label="Om personen"
                  value={e.about ?? e.info ?? ""}
                  onChange={(v) => patchCrew(m.name, { about: v })}
                />
                <TextArea
                  label="Favorittspill"
                  value={e.favGames ?? ""}
                  onChange={(v) => patchCrew(m.name, { favGames: v })}
                />
                <TextArea
                  label="Mat / allergier / drikke"
                  value={e.food ?? ""}
                  onChange={(v) => patchCrew(m.name, { food: v })}
                />
                <TextArea
                  label="Tar med seg"
                  value={e.brings ?? ""}
                  onChange={(v) => patchCrew(m.name, { brings: v })}
                />
                <TextArea
                  label="Notater"
                  value={e.notes ?? ""}
                  onChange={(v) => patchCrew(m.name, { notes: v })}
                />

                <dl className="grid gap-1.5 rounded-lg border border-border bg-background/40 p-3 text-xs">
                  {(
                    [
                      ["cpu", "CPU"],
                      ["gpu", "GPU"],
                      ["ram", "RAM"],
                      ["disk", "Disk"],
                      ["skjerm", "Skjerm"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="truncate text-foreground">{e.specs?.[key] ?? m.specs[key]}</dd>
                    </div>
                  ))}
                </dl>

                <button
                  onClick={() => setOpenPerson(null)}
                  className="w-full rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
                >
                  Lagre
                </button>
                <p className="text-center text-[10px] text-muted-foreground">
                  Alt lagres automatisk i nettleseren din.
                </p>
              </div>
            </div>
          );
        })()}

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

export function LinketurKart() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-sm text-foreground">
            <MapIcon size={15} className="text-primary" /> Kart over Hydrostranda
          </span>
          <span className="text-[11px] text-muted-foreground">Klikk for å forstørre</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block w-full overflow-hidden rounded-lg border border-border bg-white"
          aria-label="Åpne kart over Hydrostranda i stor visning"
        >
          <img
            src={kartAsset.url}
            alt="Kart over feriestedet Hydrostranda med hyttenumre, camping, brygge og fasiliteter"
            loading="lazy"
            className="h-auto w-full object-contain"
          />
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-label="Kart over Hydrostranda"
        >
          <img
            src={kartAsset.url}
            alt="Kart over feriestedet Hydrostranda"
            className="max-h-[85vh] max-w-full rounded-xl border border-border object-contain"
          />
          <button
            onClick={() => setOpen(false)}
            aria-label="Lukk kart"
            className="absolute right-4 top-4 rounded-lg border border-border bg-card p-2 text-foreground"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}

function TextArea({
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
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="mt-0.5 w-full rounded-md border border-border bg-background/60 px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/60"
      />
    </label>
  );
}

function MultiPhotoPicker({ onAdd }: { onAdd: (srcs: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Bilder</span>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="mt-0.5 flex w-full items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground"
      >
        <ImagePlus size={14} className="text-primary" /> Legg til bilder
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onAdd(await Promise.all(files.map(fileToDataUrl)));
          e.target.value = "";
        }}
      />
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

function ColorField({
  icon,
  label,
  text,
  color,
  onText,
  onColor,
}: {
  icon: React.ReactNode;
  label: string;
  text: string;
  color: string;
  onText: (v: string) => void;
  onColor: (v: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2">
      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(e) => onColor(e.target.value)}
          aria-label={`Farge for ${label}`}
          className="h-7 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent"
        />
        <input
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="Modell / farge"
          aria-label={label}
          className="min-w-0 flex-1 rounded-md border border-border bg-background/60 px-2 py-1 text-xs text-foreground outline-none focus:border-primary/60"
        />
      </div>
    </div>
  );
}
