import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Apple,
  Camera,
  Flame,
  Leaf,
  Loader2,
  Milk,
  Plus,
  Salad,
  Sparkles,
  Trash2,
  Utensils,
} from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { compressImageToWebp } from "@/lib/image-compress";
import heroImg from "@/assets/got-kosthold.jpg";
import {
  addMeal,
  analyzeMealImage,
  analyzeMealText,
  deleteMeal,
  listMeals,
  type MealAnalysis,
  type MealRow,
} from "@/lib/kosthold.functions";
import {
  MEAL_TYPES,
  NORA_LACTOSE_FREE,
  NORA_TIPS,
  SOURCE_GROUPS,
  WEEK_PLANS,
} from "@/lib/kosthold-data";

export const Route = createFileRoute("/kosthold")({
  head: () => ({
    meta: [
      { title: "Kosthold | House Pettersen-Riis" },
      {
        name: "description",
        content:
          "Kaloridagbok med AI-analyse av matbilder, laktosefri guide for Nora og ukeplaner for vektnedgang og muskelbygging.",
      },
      { property: "og:title", content: "Kosthold – kalorier, næring og ukeplaner" },
      {
        property: "og:description",
        content: "Ta bilde av maten og få kalorier og næringsstoffer beregnet av AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KostholdRoute,
});

const TABS = [
  { id: "dagbok", label: "Dagbok", icon: Utensils },
  { id: "analyse", label: "Analyser mat", icon: Camera },
  { id: "nora", label: "Nora – laktosefritt", icon: Milk },
  { id: "ukeplan", label: "Ukeplaner", icon: Salad },
  { id: "kilder", label: "Næringskilder", icon: Apple },
] as const;
type TabId = (typeof TABS)[number]["id"];

const DAILY_GOAL = { kcal: 2200, protein: 150, carbs: 230, fat: 75, fiber: 32 };

function n(v: number | null | undefined) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function fmt(v: number) {
  return Math.round(v).toLocaleString("nb-NO");
}

function isToday(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  return (
    d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()
  );
}

function KostholdRoute() {
  const [tab, setTab] = useState<TabId>("dagbok");
  const [meals, setMeals] = useState<MealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useServerFn(listMeals);

  const refresh = async () => {
    try {
      const rows = await load({ data: { days: 30 } });
      setMeals(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke hente kostholdsdagboka");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = useMemo(() => meals.filter((m) => isToday(m.eaten_at)), [meals]);
  const totals = useMemo(
    () =>
      today.reduce(
        (acc, m) => ({
          kcal: acc.kcal + n(m.kcal),
          protein: acc.protein + n(m.protein_g),
          carbs: acc.carbs + n(m.carbs_g),
          fat: acc.fat + n(m.fat_g),
          fiber: acc.fiber + n(m.fiber_g),
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      ),
    [today],
  );

  return (
    <PageShell>
      <PageHero
        eyebrow="Kjøkkenet"
        title="Kosthold"
        subtitle="Ta bilde av maten, få kalorier og næringsstoffer på sekunder — med laktosefri guide og ukeplaner."
        image={heroImg}
      />

      <div className="container mx-auto px-4 py-6 space-y-6">
        <TodaySummary totals={totals} count={today.length} loading={loading} />

        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm transition-colors ${
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-primary/5"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "dagbok" && <Dagbok meals={meals} loading={loading} onChanged={refresh} />}
        {tab === "analyse" && <Analyse onSaved={refresh} />}
        {tab === "nora" && <NoraSection />}
        {tab === "ukeplan" && <Ukeplaner />}
        {tab === "kilder" && <Kilder />}
      </div>
    </PageShell>
  );
}

function TodaySummary({
  totals,
  count,
  loading,
}: {
  totals: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
  count: number;
  loading: boolean;
}) {
  const items = [
    { label: "Kalorier", value: totals.kcal, goal: DAILY_GOAL.kcal, unit: "kcal", color: "bg-amber-400" },
    { label: "Protein", value: totals.protein, goal: DAILY_GOAL.protein, unit: "g", color: "bg-red-400" },
    { label: "Karbo", value: totals.carbs, goal: DAILY_GOAL.carbs, unit: "g", color: "bg-sky-400" },
    { label: "Fett", value: totals.fat, goal: DAILY_GOAL.fat, unit: "g", color: "bg-yellow-300" },
    { label: "Fiber", value: totals.fiber, goal: DAILY_GOAL.fiber, unit: "g", color: "bg-emerald-400" },
  ];
  return (
    <div className="panel rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
          <Flame className="h-4 w-4" /> I dag
        </h2>
        <span className="text-xs text-muted-foreground">
          {loading ? "laster…" : `${count} måltid${count === 1 ? "" : "er"} registrert`}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {items.map((it) => {
          const pct = Math.min(100, (it.value / it.goal) * 100);
          return (
            <div key={it.label} className="rounded-lg border border-border bg-card/40 p-3">
              <div className="text-xs text-muted-foreground">{it.label}</div>
              <div className="text-2xl text-foreground text-display">
                {fmt(it.value)}
                <span className="text-xs text-muted-foreground ml-1">/ {it.goal} {it.unit}</span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${it.color} transition-all duration-700`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Dagbok({
  meals,
  loading,
  onChanged,
}: {
  meals: MealRow[];
  loading: boolean;
  onChanged: () => Promise<void>;
}) {
  const del = useServerFn(deleteMeal);
  const [busy, setBusy] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, MealRow[]>();
    for (const m of meals) {
      const key = new Date(m.eaten_at).toLocaleDateString("nb-NO", {
        weekday: "long",
        day: "2-digit",
        month: "short",
      });
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [meals]);

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await del({ data: { id } });
      await onChanged();
      toast.success("Måltid slettet");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Klarte ikke slette");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <ManualAdd onSaved={onChanged} />

      {loading && (
        <div className="panel rounded-lg p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Henter dagbok…
        </div>
      )}

      {!loading && meals.length === 0 && (
        <div className="panel rounded-lg p-6 text-center text-muted-foreground">
          Ingen måltider registrert ennå. Bruk «Analyser mat» eller legg til manuelt.
        </div>
      )}

      {grouped.map(([day, rows]) => {
        const kcal = rows.reduce((a, r) => a + n(r.kcal), 0);
        return (
          <CollapsibleSection
            key={day}
            id={`kosthold-day-${day}`}
            title={day}
            badge={<span className="text-xs text-muted-foreground">{fmt(kcal)} kcal</span>}
          >
            <div className="space-y-2">
              {rows.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card/40 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-foreground font-medium">{m.name}</span>
                      <span className="text-[10px] uppercase tracking-wider rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                        {m.meal_type}
                      </span>
                      {m.lactose_free === true && (
                        <span className="text-[10px] rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5">
                          laktosefri
                        </span>
                      )}
                      {m.source !== "manual" && (
                        <span className="text-[10px] rounded-full bg-primary/15 text-primary px-2 py-0.5">AI</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(m.eaten_at).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                      {m.amount_text ? ` · ${m.amount_text}` : ""} · {fmt(n(m.kcal))} kcal · P {fmt(n(m.protein_g))} g
                      · K {fmt(n(m.carbs_g))} g · F {fmt(n(m.fat_g))} g · Fiber {fmt(n(m.fiber_g))} g
                    </div>
                    {m.notes && <div className="text-xs text-muted-foreground/80 mt-1">{m.notes}</div>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(m.id)}
                    disabled={busy === m.id}
                    aria-label="Slett måltid"
                  >
                    {busy === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        );
      })}
    </div>
  );
}

function ManualAdd({ onSaved }: { onSaved: () => Promise<void> }) {
  const save = useServerFn(addMeal);
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [mealType, setMealType] = useState<string>("annet");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error("Skriv inn hva du spiste");
    setBusy(true);
    try {
      await save({
        data: {
          name: name.trim(),
          meal_type: mealType,
          kcal: kcal ? Number(kcal) : null,
          protein_g: protein ? Number(protein) : null,
          source: "manual",
          who: "Alle",
        },
      });
      setName("");
      setKcal("");
      setProtein("");
      await onSaved();
      toast.success("Lagt til i dagboka");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Klarte ikke lagre");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel rounded-lg p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-primary mb-3 flex items-center gap-2">
        <Plus className="h-4 w-4" /> Legg til raskt
      </h3>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <Input placeholder="Hva spiste du?" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="kcal" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        <Input placeholder="protein g" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} />
        <Button onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre"}
        </Button>
      </div>
      <div className="mt-2 flex gap-2 flex-wrap">
        {MEAL_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setMealType(t)}
            className={`rounded-full border px-3 py-1 text-xs capitalize ${
              mealType === t ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function Analyse({ onSaved }: { onSaved: () => Promise<void> }) {
  const analyzeImg = useServerFn(analyzeMealImage);
  const analyzeTxt = useServerFn(analyzeMealText);
  const save = useServerFn(addMeal);
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MealAnalysis | null>(null);
  const [mealType, setMealType] = useState<string>("annet");

  const onFile = async (file: File) => {
    setBusy(true);
    setResult(null);
    try {
      const small = await compressImageToWebp(file, { maxDim: 1024, quality: 0.75 });
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(small);
      });
      setPreview(dataUrl);
      const res = await analyzeImg({ data: { imageDataUrl: dataUrl, hint: hint || undefined } });
      setResult(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI klarte ikke lese bildet");
    } finally {
      setBusy(false);
    }
  };

  const onText = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setResult(null);
    setPreview(null);
    try {
      setResult(await analyzeTxt({ data: { text: text.trim() } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI feilet");
    } finally {
      setBusy(false);
    }
  };

  const keep = async () => {
    if (!result) return;
    setBusy(true);
    try {
      await save({
        data: {
          name: result.name,
          meal_type: mealType,
          amount_text: result.amount_text,
          kcal: result.kcal,
          protein_g: result.protein_g,
          carbs_g: result.carbs_g,
          fat_g: result.fat_g,
          fiber_g: result.fiber_g,
          sugar_g: result.sugar_g,
          lactose_free: result.lactose_free,
          notes: result.notes,
          source: preview ? "ai-photo" : "ai-text",
          who: "Alle",
        },
      });
      setResult(null);
      setPreview(null);
      setText("");
      await onSaved();
      toast.success("Lagret i dagboka");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Klarte ikke lagre");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
          <Camera className="h-4 w-4" /> Ta bilde av maten
        </h3>
        <p className="text-xs text-muted-foreground">
          AI anslår porsjon, kalorier, protein, karbo, fett og fiber — og sjekker om måltidet er laktosefritt.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
        <Input placeholder="Valgfritt: hva er på tallerkenen?" value={hint} onChange={(e) => setHint(e.target.value)} />
        <Button onClick={() => fileRef.current?.click()} disabled={busy} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
          Velg eller ta bilde
        </Button>
        {preview && (
          <img src={preview} alt="Måltid" className="w-full rounded-lg border border-border object-cover max-h-72" />
        )}

        <div className="pt-2 border-t border-border">
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">…eller beskriv måltidet</h4>
          <Textarea
            rows={3}
            placeholder="F.eks. 2 skiver grovbrød med egg og avokado, og en banan"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button variant="secondary" onClick={onText} disabled={busy} className="mt-2 w-full">
            <Sparkles className="h-4 w-4 mr-2" /> Beregn fra tekst
          </Button>
        </div>
      </div>

      <div className="panel rounded-lg p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">Resultat</h3>
        {!result && (
          <p className="text-sm text-muted-foreground">
            {busy ? "AI analyserer måltidet…" : "Ingen analyse ennå."}
          </p>
        )}
        {result && (
          <div className="space-y-3">
            <div>
              <div className="text-xl text-display text-foreground">{result.name}</div>
              <div className="text-xs text-muted-foreground">
                {result.amount_text} · sikkerhet: {result.confidence}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                ["Kalorier", `${fmt(result.kcal)} kcal`],
                ["Protein", `${fmt(result.protein_g)} g`],
                ["Karbo", `${fmt(result.carbs_g)} g`],
                ["Fett", `${fmt(result.fat_g)} g`],
                ["Fiber", `${fmt(result.fiber_g)} g`],
                ["Sukker", `${fmt(result.sugar_g)} g`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border bg-card/40 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
                  <div className="text-foreground">{v}</div>
                </div>
              ))}
            </div>
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                result.lactose_free
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-amber-500/10 text-amber-300"
              }`}
            >
              {result.lactose_free
                ? "Ser laktosefritt ut — trygt for Nora."
                : "Inneholder trolig melkeprodukter — ikke egnet for Nora uten bytte."}
            </div>
            {result.notes && <p className="text-sm text-muted-foreground">{result.notes}</p>}
            <div className="flex gap-2 flex-wrap">
              {MEAL_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMealType(t)}
                  className={`rounded-full border px-3 py-1 text-xs capitalize ${
                    mealType === t ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <Button onClick={keep} disabled={busy} className="w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Legg til i dagboka
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function NoraSection() {
  const cats = useMemo(() => [...new Set(NORA_LACTOSE_FREE.map((p) => p.category))], []);
  return (
    <div className="space-y-4">
      <div className="panel rounded-lg p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
          <Milk className="h-4 w-4" /> Nora — laktosefritt
        </h3>
        <p className="text-sm text-muted-foreground mt-2">
          Egen oversikt for Nora: produkter som trygt kan brukes, og hva man må se opp for. Alle ukeplanene på
          denne siden er laktosefrie.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {NORA_TIPS.map((t) => (
            <li key={t} className="flex gap-2 text-sm text-muted-foreground">
              <Leaf className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      {cats.map((c) => (
        <CollapsibleSection key={c} id={`nora-${c}`} title={c}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {NORA_LACTOSE_FREE.filter((p) => p.category === c).map((p) => (
              <div key={p.name} className="rounded-lg border border-border bg-card/40 p-3">
                <div className="text-foreground font-medium">{p.name}</div>
                <div className="text-xs text-primary">{p.brand}</div>
                <p className="text-xs text-muted-foreground mt-1">{p.note}</p>
                {p.kcalPer100 !== null && (
                  <div className="text-[11px] text-muted-foreground mt-2">
                    {p.kcalPer100} kcal / 100 g · {p.proteinPer100} g protein
                  </div>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
}

function Ukeplaner() {
  const [active, setActive] = useState(WEEK_PLANS[0].id);
  const plan = WEEK_PLANS.find((p) => p.id === active) ?? WEEK_PLANS[0];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {WEEK_PLANS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActive(p.id)}
            className={`rounded-full border px-4 py-2 text-sm ${
              active === p.id ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"
            }`}
          >
            {p.title}
          </button>
        ))}
      </div>

      <div className="panel rounded-lg p-4">
        <h3 className="text-lg text-display text-foreground">{plan.title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{plan.goal}</p>
        <div className="mt-2 text-xs text-primary">
          {plan.kcalTarget} · {plan.macros}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {plan.days.map((d) => {
          const sum = d.meals.reduce((a, m) => a + m.kcal, 0);
          return (
            <div key={d.day} className="panel rounded-lg p-4">
              <div className="flex items-baseline justify-between">
                <div className="text-sm font-semibold uppercase tracking-wider text-primary">{d.day}</div>
                <div className="text-xs text-muted-foreground">{fmt(sum)} kcal</div>
              </div>
              <ul className="mt-3 space-y-2">
                {d.meals.map((m) => (
                  <li key={m.label} className="rounded-lg border border-border bg-card/40 p-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
                    <div className="text-sm text-foreground">{m.text}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{m.kcal} kcal</div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kilder() {
  return (
    <div className="space-y-4">
      {SOURCE_GROUPS.map((g) => {
        const max = Math.max(...g.items.map((i) => i.value));
        return (
          <CollapsibleSection key={g.key} id={`kilder-${g.key}`} title={g.title}>
            <p className="text-sm text-muted-foreground mb-3">{g.blurb}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((it) => (
                <div key={it.name} className="rounded-lg border border-border bg-card/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl">{it.emoji}</span>
                      <div className="min-w-0">
                        <div className="text-foreground truncate">{it.name}</div>
                        <div className="text-[11px] text-muted-foreground">{it.per} · {it.kcal} kcal</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg text-display" style={{ color: g.color }}>
                        {it.value} g
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{g.unitLabel}</div>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full transition-all duration-700"
                      style={{ width: `${(it.value / max) * 100}%`, background: g.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        );
      })}
    </div>
  );
}
