import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Apple,
  Camera,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Flame,
  Loader2,
  Milk,
  Pencil,
  Plus,
  Salad,
  Sparkles,
  Target,
  TrendingUp,
  Trash2,
  Utensils,
} from "lucide-react";
import { PageShell, PageHero } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { compressImageToWebp } from "@/lib/image-compress";
import heroImg from "@/assets/got-kosthold.jpg";
import {
  addMeal,
  analyzeMealImage,
  analyzeMealText,
  deleteMeal,
  listGoals,
  listMeals,
  saveGoal,
  updateMeal,
  type GoalRow,
  type MealItem,
  type MealRow,
} from "@/lib/kosthold.functions";
import {
  LACTOSE_AVOID,
  LACTOSE_PERSON,
  LACTOSE_SAFE,
  LACTOSE_TIPS,
  MEAL_TYPES,
  PERSONS,
  SOURCE_GROUPS,
  WEEK_PLANS,
  calcCalorieNeed,
} from "@/lib/kosthold-data";

export const Route = createFileRoute("/kosthold")({
  head: () => ({
    meta: [
      { title: "Kosthold – kaloridagbok og ukeplaner | House Pettersen-Riis" },
      {
        name: "description",
        content:
          "Kaloridagbok med AI-analyse av matbilder, personlige makromål, laktosefri guide for Nora og ukeplaner for vektnedgang og muskelbygging.",
      },
      { property: "og:title", content: "Kosthold – kalorier, makroer og ukeplaner" },
      {
        property: "og:description",
        content: "Ta bilde av maten og få kalorier, makroer og helsescore beregnet av AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KostholdRoute,
});

const DEFAULT_GOAL = {
  plan_type: "Vedlikehold",
  calorie_goal: 2200,
  protein_goal: 130,
  carbs_goal: 230,
  fat_goal: 70,
  fiber_goal: 30,
};

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const r = (v: number) => Math.round(v);
const todayIso = () => new Date().toISOString().slice(0, 10);

type Form = {
  meal_type: string;
  name: string;
  items: MealItem[];
  kcal: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  fiber_g: string;
  health_score: number | null;
  lactose_free: boolean | null;
  ai_notes: string;
  notes: string;
  time: string;
};

const EMPTY_FORM: Form = {
  meal_type: "Frokost",
  name: "",
  items: [],
  kcal: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
  fiber_g: "",
  health_score: null,
  lactose_free: null,
  ai_notes: "",
  notes: "",
  time: "12:00",
};

function KostholdRoute() {
  const fetchMeals = useServerFn(listMeals);
  const fetchGoals = useServerFn(listGoals);
  const create = useServerFn(addMeal);
  const patch = useServerFn(updateMeal);
  const remove = useServerFn(deleteMeal);
  const analyzeImg = useServerFn(analyzeMealImage);
  const analyzeTxt = useServerFn(analyzeMealText);

  const [person, setPerson] = useState<string>(PERSONS[0]);
  const [date, setDate] = useState<string>(todayIso());
  const [rows, setRows] = useState<MealRow[]>([]);
  const [goals, setGoals] = useState<Record<string, GoalRow>>({});
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [textInput, setTextInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meals, goalRows] = await Promise.all([
        fetchMeals({ data: { days: 35 } }),
        fetchGoals(),
      ]);
      setRows(meals);
      const map: Record<string, GoalRow> = {};
      goalRows.forEach((g) => (map[g.person] = g));
      setGoals(map);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke hente kostholdsdata");
    } finally {
      setLoading(false);
    }
  }, [fetchMeals, fetchGoals]);

  useEffect(() => {
    void load();
  }, [load]);

  const goal = goals[person];
  const g = { ...DEFAULT_GOAL, ...(goal ?? {}) };

  const personRows = useMemo(() => rows.filter((m) => m.who === person), [rows, person]);
  const meals = useMemo(
    () => personRows.filter((m) => m.eaten_at.slice(0, 10) === date),
    [personRows, date],
  );

  const totals = useMemo(
    () =>
      meals.reduce(
        (a, m) => ({
          kcal: a.kcal + num(m.kcal),
          protein: a.protein + num(m.protein_g),
          carbs: a.carbs + num(m.carbs_g),
          fat: a.fat + num(m.fat_g),
          fiber: a.fiber + num(m.fiber_g),
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      ),
    [meals],
  );

  const trend = useMemo(() => {
    const days: { label: string; iso: string; kcal: number }[] = [];
    const base = new Date(date + "T00:00:00");
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const kcal = personRows
        .filter((m) => m.eaten_at.slice(0, 10) === iso)
        .reduce((s, m) => s + num(m.kcal), 0);
      days.push({ label: ["Sø", "Ma", "Ti", "On", "To", "Fr", "Lø"][d.getDay()], iso, kcal });
    }
    return days;
  }, [personRows, date]);

  const trendMax = Math.max(g.calorie_goal, ...trend.map((t) => t.kcal), 1);

  const frequent = useMemo(() => {
    const map = new Map<string, { meal: MealRow; count: number }>();
    personRows.forEach((m) => {
      const key = m.name.toLowerCase();
      const e = map.get(key);
      if (e) e.count++;
      else map.set(key, { meal: m, count: 1 });
    });
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [personRows]);

  const shiftDay = (delta: number) => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  };

  const openNew = (mealType?: string) => {
    setEditId(null);
    setForm({
      ...EMPTY_FORM,
      meal_type: mealType ?? "Frokost",
      time: new Date().toTimeString().slice(0, 5),
    });
    setFormOpen(true);
  };

  const openEdit = (m: MealRow) => {
    setEditId(m.id);
    setForm({
      meal_type: m.meal_type,
      name: m.name,
      items: m.items ?? [],
      kcal: m.kcal?.toString() ?? "",
      protein_g: m.protein_g?.toString() ?? "",
      carbs_g: m.carbs_g?.toString() ?? "",
      fat_g: m.fat_g?.toString() ?? "",
      fiber_g: m.fiber_g?.toString() ?? "",
      health_score: m.health_score,
      lactose_free: m.lactose_free,
      ai_notes: m.ai_notes ?? "",
      notes: m.notes ?? "",
      time: new Date(m.eaten_at).toTimeString().slice(0, 5),
    });
    setFormOpen(true);
  };

  const applyAnalysis = (a: Awaited<ReturnType<typeof analyzeMealText>>) => {
    setForm((f) => ({
      ...f,
      name: a.name || f.name,
      meal_type: MEAL_TYPES.includes(a.meal_type as never) ? a.meal_type : f.meal_type,
      items: a.items ?? [],
      kcal: String(r(a.kcal)),
      protein_g: String(r(a.protein_g)),
      carbs_g: String(r(a.carbs_g)),
      fat_g: String(r(a.fat_g)),
      fiber_g: String(r(a.fiber_g)),
      health_score: a.health_score ?? null,
      lactose_free: a.lactose_free,
      ai_notes: a.notes ?? "",
    }));
    toast.success("AI-analyse fullført", { description: a.name });
  };

  const handlePhoto = async (file: File) => {
    setAnalyzing(true);
    try {
      const small = await compressImageToWebp(file, { maxDim: 1024, quality: 0.75 });
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("Kunne ikke lese bildet"));
        fr.readAsDataURL(small);
      });
      if (!formOpen) {
        setEditId(null);
        setForm({ ...EMPTY_FORM, time: new Date().toTimeString().slice(0, 5) });
        setFormOpen(true);
      }
      const a = await analyzeImg({ data: { imageDataUrl: dataUrl } });
      applyAnalysis(a);
    } catch (e) {
      toast.error("AI-analyse feilet", {
        description: e instanceof Error ? e.message : "Ukjent feil",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleText = async () => {
    if (textInput.trim().length < 2) return;
    setAnalyzing(true);
    try {
      const a = await analyzeTxt({ data: { text: textInput.trim() } });
      setEditId(null);
      setForm({ ...EMPTY_FORM, time: new Date().toTimeString().slice(0, 5) });
      setFormOpen(true);
      applyAnalysis(a);
      setTextInput("");
    } catch (e) {
      toast.error("AI-analyse feilet", {
        description: e instanceof Error ? e.message : "Ukjent feil",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Mangler navn på måltid");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        who: person,
        eaten_at: new Date(`${date}T${form.time || "12:00"}:00`).toISOString(),
        meal_type: form.meal_type,
        name: form.name.trim(),
        items: form.items,
        kcal: numOrNull(form.kcal),
        protein_g: numOrNull(form.protein_g),
        carbs_g: numOrNull(form.carbs_g),
        fat_g: numOrNull(form.fat_g),
        fiber_g: numOrNull(form.fiber_g),
        health_score: form.health_score,
        lactose_free: form.lactose_free,
        ai_notes: form.ai_notes.trim() || null,
        notes: form.notes.trim() || null,
        source: form.ai_notes ? "ai" : "manual",
      };
      if (editId) await patch({ data: { ...payload, id: editId } });
      else await create({ data: payload });
      toast.success(editId ? "Måltid oppdatert" : "Måltid lagret");
      setFormOpen(false);
      setForm(EMPTY_FORM);
      setEditId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke lagre");
    } finally {
      setSaving(false);
    }
  };

  const del = async (m: MealRow) => {
    if (!confirm(`Slette «${m.name}»?`)) return;
    try {
      await remove({ data: { id: m.id } });
      await load();
    } catch {
      toast.error("Kunne ikke slette");
    }
  };

  const repeat = async (m: MealRow) => {
    try {
      await create({
        data: {
          who: person,
          eaten_at: new Date(`${date}T${new Date().toTimeString().slice(0, 5)}:00`).toISOString(),
          meal_type: m.meal_type,
          name: m.name,
          items: m.items ?? [],
          kcal: m.kcal,
          protein_g: m.protein_g,
          carbs_g: m.carbs_g,
          fat_g: m.fat_g,
          fiber_g: m.fiber_g,
          health_score: m.health_score,
          lactose_free: m.lactose_free,
          ai_notes: m.ai_notes,
          source: m.source,
        },
      });
      toast.success("Lagt til igjen", { description: m.name });
      await load();
    } catch {
      toast.error("Kunne ikke kopiere");
    }
  };

  const isToday = date === todayIso();

  return (
    <PageShell>
      <PageHero
        eyebrow="Ernæringsmatrise"
        title="Kosthold"
        subtitle="Foto-AI · makroer · ukeplaner · laktosefritt"
        image={heroImg}
      />

      <div className="container mx-auto px-4 py-8 space-y-6 max-w-6xl">
        {/* Person + dato */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap gap-1 rounded-full border border-border p-1">
            {PERSONS.map((p) => (
              <button
                key={p}
                onClick={() => setPerson(p)}
                className={`px-3.5 py-1.5 rounded-full text-xs uppercase tracking-widest transition-colors ${
                  person === p
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => shiftDay(-1)}
              aria-label="Forrige dag"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayIso())}
              className="w-[150px] text-center"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => shiftDay(1)}
              aria-label="Neste dag"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isToday && (
              <Button variant="ghost" size="sm" onClick={() => setDate(todayIso())}>
                I dag
              </Button>
            )}
          </div>
        </div>

        {/* Dagsoversikt */}
        <Card>
          <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row gap-6 items-center">
            <CalorieRing eaten={totals.kcal} goal={g.calorie_goal} />
            <div className="flex-1 w-full space-y-3">
              <MacroBar label="Protein" value={totals.protein} goal={g.protein_goal} />
              <MacroBar label="Karbo" value={totals.carbs} goal={g.carbs_goal} />
              <MacroBar label="Fett" value={totals.fat} goal={g.fat_goal} />
              <MacroBar label="Fiber" value={totals.fiber} goal={g.fiber_goal} />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                  <Target className="h-3 w-3" /> Plan: {g.plan_type}
                </span>
                <Button variant="outline" size="sm" onClick={() => setGoalOpen(true)}>
                  Endre mål
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hurtighandlinger */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Button
            className="h-auto py-4 flex-col gap-1"
            onClick={() => fileRef.current?.click()}
            disabled={analyzing}
          >
            {analyzing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Camera className="h-5 w-5" />
            )}
            <span className="text-xs uppercase tracking-widest">Ta bilde av mat</span>
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handlePhoto(f);
              e.target.value = "";
            }}
          />
          {(["Frokost", "Lunsj", "Middag"] as const).map((t) => (
            <Button
              key={t}
              variant="outline"
              className="h-auto py-4 flex-col gap-1"
              onClick={() => openNew(t)}
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs uppercase tracking-widest">{t}</span>
            </Button>
          ))}
        </div>

        {/* Beskriv måltid med tekst */}
        <div className="flex gap-2">
          <Input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleText();
            }}
            placeholder="Skriv hva du spiste – f.eks. «to brødskiver med ost og et eple»"
          />
          <Button
            onClick={() => void handleText()}
            disabled={analyzing || textInput.trim().length < 2}
          >
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">Analyser</span>
          </Button>
        </div>

        <Tabs defaultValue="dag" className="w-full">
          <TabsList className="grid grid-cols-3 sm:grid-cols-5 w-full h-auto">
            <TabsTrigger value="dag" className="text-xs uppercase tracking-widest">
              Dagbok
            </TabsTrigger>
            <TabsTrigger value="trend" className="text-xs uppercase tracking-widest">
              Trend
            </TabsTrigger>
            <TabsTrigger value="plan" className="text-xs uppercase tracking-widest">
              Ukeplan
            </TabsTrigger>
            <TabsTrigger value="kilder" className="text-xs uppercase tracking-widest">
              Næring
            </TabsTrigger>
            <TabsTrigger value="laktose" className="text-xs uppercase tracking-widest">
              Laktose
            </TabsTrigger>
          </TabsList>

          {/* DAGBOK */}
          <TabsContent value="dag" className="space-y-4 mt-4">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              MEAL_TYPES.map((type) => {
                const list = meals.filter((m) => m.meal_type === type);
                if (!list.length) return null;
                const kcal = list.reduce((s, m) => s + num(m.kcal), 0);
                return (
                  <Card key={type}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm uppercase tracking-widest flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Utensils className="h-4 w-4" /> {type}
                        </span>
                        <span className="tabular-nums text-primary">{r(kcal)} kcal</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {list.map((m) => (
                        <div
                          key={m.id}
                          className="flex gap-3 items-start rounded-lg border border-border/60 p-2.5 bg-card/40"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{m.name}</span>
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                {new Date(m.eaten_at).toTimeString().slice(0, 5)}
                              </span>
                              {m.health_score != null && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                                    m.health_score >= 70
                                      ? "text-emerald-500 border-emerald-500/40"
                                      : m.health_score >= 45
                                        ? "text-amber-500 border-amber-500/40"
                                        : "text-destructive border-destructive/40"
                                  }`}
                                >
                                  Score {m.health_score}
                                </span>
                              )}
                              {m.lactose_free === false && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/40 text-amber-500">
                                  Laktose
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                              {r(num(m.kcal))} kcal · P {r(num(m.protein_g))}g · K{" "}
                              {r(num(m.carbs_g))}g · F {r(num(m.fat_g))}g
                            </div>
                            {m.items && m.items.length > 0 && (
                              <div className="text-[11px] text-muted-foreground/80 mt-1 truncate">
                                {m.items
                                  .map((i) => `${i.name}${i.amount_g ? ` ${r(i.amount_g)}g` : ""}`)
                                  .join(" · ")}
                              </div>
                            )}
                            {m.ai_notes && (
                              <p className="text-[11px] text-primary mt-1 flex gap-1">
                                <Sparkles className="h-3 w-3 shrink-0 mt-0.5" />
                                {m.ai_notes}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(m)}
                              aria-label="Rediger"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void del(m)}
                              aria-label="Slett"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })
            )}

            {!loading && meals.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center space-y-3">
                  <Apple className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Ingen måltider registrert på {person} denne dagen.
                  </p>
                  <Button onClick={() => fileRef.current?.click()}>
                    <Camera className="h-4 w-4 mr-2" /> Ta bilde av maten
                  </Button>
                </CardContent>
              </Card>
            )}

            {frequent.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
                    <Flame className="h-4 w-4" /> Ofte spist · legg til på nytt
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {frequent.map(({ meal, count }) => (
                    <button
                      key={meal.id}
                      onClick={() => void repeat(meal)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      {meal.name} · {r(num(meal.kcal))} kcal
                      <span className="text-[10px] opacity-70"> ×{count}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* TREND */}
          <TabsContent value="trend" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Siste 7 dager · {person}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 h-44">
                  {trend.map((d) => {
                    const h = (d.kcal / trendMax) * 100;
                    const over = d.kcal > g.calorie_goal;
                    return (
                      <button
                        key={d.iso}
                        onClick={() => setDate(d.iso)}
                        className="flex-1 flex flex-col items-center gap-1 group"
                      >
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {r(d.kcal) || ""}
                        </span>
                        <div className="w-full flex-1 flex items-end">
                          <div
                            className={`w-full rounded-t-md transition-all ${over ? "bg-destructive/70" : "bg-primary/70"} ${
                              d.iso === date ? "opacity-100 ring-2 ring-primary" : "opacity-70"
                            }`}
                            style={{ height: `${Math.max(h, 2)}%` }}
                          />
                        </div>
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          {d.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {[
                    {
                      label: "Snitt/dag",
                      value: `${r(trend.reduce((s, t) => s + t.kcal, 0) / 7)} kcal`,
                    },
                    {
                      label: "Dager på mål",
                      value: `${trend.filter((t) => t.kcal > 0 && t.kcal <= g.calorie_goal).length}/7`,
                    },
                    { label: "Måltider (35d)", value: String(personRows.length) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg border border-border/60 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {s.label}
                      </div>
                      <div className="text-lg font-bold text-primary mt-1">{s.value}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* UKEPLAN */}
          <TabsContent value="plan" className="space-y-4 mt-4">
            {WEEK_PLANS.map((plan) => (
              <Card key={plan.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm uppercase tracking-widest">{plan.title}</CardTitle>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest">
                    {plan.subtitle}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {plan.principles.map((p) => (
                      <div
                        key={p.title}
                        className="rounded-lg border border-border p-2.5 bg-card/40"
                      >
                        <div className="text-[10px] uppercase tracking-widest text-primary">
                          {p.title}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">{p.text}</div>
                      </div>
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[560px]">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          <th className="text-left p-2">Dag</th>
                          <th className="text-left p-2">Frokost</th>
                          <th className="text-left p-2">Lunsj</th>
                          {plan.days.some((d) => d.snack) && (
                            <th className="text-left p-2">Snack</th>
                          )}
                          <th className="text-left p-2">Middag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.days.map((d) => (
                          <tr key={d.day} className="border-t border-border/50 align-top">
                            <td className="p-2 font-medium text-primary whitespace-nowrap">
                              {d.day}
                            </td>
                            <td className="p-2 text-muted-foreground">{d.frokost}</td>
                            <td className="p-2 text-muted-foreground">{d.lunsj}</td>
                            {plan.days.some((x) => x.snack) && (
                              <td className="p-2 text-muted-foreground">{d.snack ?? "—"}</td>
                            )}
                            <td className="p-2 text-muted-foreground">{d.middag}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* NÆRINGSKILDER */}
          <TabsContent value="kilder" className="space-y-4 mt-4">
            {SOURCE_GROUPS.map((grp) => {
              const max = Math.max(...grp.items.map((i) => i.value));
              return (
                <Card key={grp.key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm uppercase tracking-widest">
                      Kilder til {grp.label}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest">
                      {grp.blurb}
                    </p>
                  </CardHeader>
                  <CardContent className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                    {grp.items.map((i) => (
                      <div key={i.name}>
                        <div className="flex justify-between text-xs">
                          <span>
                            {i.name} <span className="text-muted-foreground">({i.portion})</span>
                          </span>
                          <span className="tabular-nums text-primary">
                            {i.value} {grp.unit}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden mt-1">
                          <div
                            className="h-full bg-primary/70 rounded-full"
                            style={{ width: `${(i.value / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* LAKTOSEFRITT – NORA */}
          <TabsContent value="laktose" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm uppercase tracking-widest flex items-center gap-2">
                  <Milk className="h-4 w-4" /> Laktosefritt · {LACTOSE_PERSON}
                </CardTitle>
                <p className="text-xs text-muted-foreground uppercase tracking-widest">
                  Personlig kostprofil – laktosefri
                </p>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-2">
                <p>
                  Denne oversikten er knyttet til{" "}
                  <strong className="text-foreground">{LACTOSE_PERSON}</strong> og gjelder alle
                  måltider som registreres på henne. Bruk listene når du planlegger ukemeny, handler
                  eller lager mat til hele familien.
                </p>
                {person !== LACTOSE_PERSON && (
                  <button
                    onClick={() => setPerson(LACTOSE_PERSON)}
                    className="text-[11px] uppercase tracking-widest text-primary underline underline-offset-4"
                  >
                    Bytt til {LACTOSE_PERSON}
                  </button>
                )}
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm uppercase tracking-widest">Trygt å spise</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {LACTOSE_SAFE.map((i) => (
                    <div key={i.name} className="border-l-2 border-primary/60 pl-2">
                      <div className="text-xs font-medium">{i.name}</div>
                      <div className="text-[11px] text-muted-foreground">{i.note}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm uppercase tracking-widest text-destructive">
                    Unngå / sjekk alltid
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {LACTOSE_AVOID.map((i) => (
                    <div key={i.name} className="border-l-2 border-destructive/60 pl-2">
                      <div className="text-xs font-medium">{i.name}</div>
                      <div className="text-[11px] text-muted-foreground">{i.note}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm uppercase tracking-widest">Gode råd</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-3">
                {LACTOSE_TIPS.map((t) => (
                  <div key={t.title} className="rounded-md border border-border p-2">
                    <div className="text-xs font-medium text-primary uppercase tracking-widest">
                      {t.title}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">{t.text}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Måltid-dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-widest">
              {editId ? "Rediger måltid" : "Nytt måltid"} · {person}
            </DialogTitle>
            <DialogDescription>
              Ta bilde så regner AI ut kalorier og næringsstoffer, eller fyll inn manuelt.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileRef.current?.click()}
              disabled={analyzing}
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Camera className="h-4 w-4 mr-2" />
              )}
              {analyzing ? "Analyserer…" : "Bilde + AI"}
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Type
                </label>
                <select
                  value={form.meal_type}
                  onChange={(e) => setForm((f) => ({ ...f, meal_type: e.target.value }))}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {MEAL_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Klokkeslett
                </label>
                <Input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Måltid
              </label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="F.eks. Laks med quinoa"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["kcal", "Kcal"],
                  ["protein_g", "Protein g"],
                  ["carbs_g", "Karbo g"],
                  ["fat_g", "Fett g"],
                  ["fiber_g", "Fiber g"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {label}
                  </label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            {form.items.length > 0 && (
              <div className="rounded-lg border border-border/60 p-2 text-xs space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-primary">AI fant</div>
                {form.items.map((i, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>
                      {i.name} {i.amount_g ? `· ${r(i.amount_g)} g` : ""}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {r(num(i.calories))} kcal
                    </span>
                  </div>
                ))}
              </div>
            )}

            {form.ai_notes && (
              <p className="text-xs text-primary flex gap-1">
                <Sparkles className="h-3 w-3 shrink-0 mt-0.5" />
                {form.ai_notes}
              </p>
            )}

            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Notat
              </label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>

            <Button className="w-full" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Lagre måltid
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <GoalDialog
        open={goalOpen}
        onOpenChange={setGoalOpen}
        person={person}
        goal={goal}
        onSaved={() => void load()}
      />
    </PageShell>
  );
}

function CalorieRing({ eaten, goal }: { eaten: number; goal: number }) {
  const pct = Math.min(eaten / Math.max(goal, 1), 1.35);
  const size = 148;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const over = eaten > goal;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          className="stroke-muted/40"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          className={over ? "stroke-destructive" : "stroke-primary"}
          style={{
            strokeDasharray: circ,
            strokeDashoffset: circ * (1 - Math.min(pct, 1)),
            transition: "stroke-dashoffset .6s ease",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{r(eaten)}</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          av {r(goal)} kcal
        </span>
        <span
          className={`text-[11px] tabular-nums mt-0.5 ${over ? "text-destructive" : "text-primary"}`}
        >
          {over ? `+${r(eaten - goal)} over` : `${r(goal - eaten)} igjen`}
        </span>
      </div>
    </div>
  );
}

function MacroBar({ label, value, goal }: { label: string; value: number; goal: number }) {
  const pct = Math.min((value / Math.max(goal, 1)) * 100, 100);
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {r(value)} / {r(goal)} g
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted/40 overflow-hidden mt-1">
        <div
          className="h-full bg-primary/70 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function GoalDialog({
  open,
  onOpenChange,
  person,
  goal,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  person: string;
  goal?: GoalRow;
  onSaved: () => void;
}) {
  const persist = useServerFn(saveGoal);
  const [calc, setCalc] = useState({
    sex: person === "Arne" ? "mann" : "kvinne",
    weightKg: 75,
    heightCm: 175,
    age: 40,
    activity: 1.55,
    goalType: "vedlikehold" as "ned" | "vedlikehold" | "opp",
  });
  const [vals, setVals] = useState({
    calorie_goal: goal?.calorie_goal ?? DEFAULT_GOAL.calorie_goal,
    protein_goal: goal?.protein_goal ?? DEFAULT_GOAL.protein_goal,
    carbs_goal: goal?.carbs_goal ?? DEFAULT_GOAL.carbs_goal,
    fat_goal: goal?.fat_goal ?? DEFAULT_GOAL.fat_goal,
    fiber_goal: goal?.fiber_goal ?? DEFAULT_GOAL.fiber_goal,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCalc((c) => ({ ...c, sex: person === "Arne" ? "mann" : "kvinne" }));
    if (goal) {
      setVals({
        calorie_goal: goal.calorie_goal,
        protein_goal: goal.protein_goal,
        carbs_goal: goal.carbs_goal,
        fat_goal: goal.fat_goal,
        fiber_goal: goal.fiber_goal,
      });
    }
  }, [goal, person, open]);

  const applyCalc = () => {
    const res = calcCalorieNeed({
      sex: calc.sex as "mann" | "kvinne",
      weightKg: Number(calc.weightKg),
      heightCm: Number(calc.heightCm),
      age: Number(calc.age),
      activity: Number(calc.activity),
      goal: calc.goalType,
    });
    setVals((v) => ({
      ...v,
      calorie_goal: res.target,
      protein_goal: res.protein,
      carbs_goal: res.carbs,
      fat_goal: res.fat,
    }));
    toast.success("Beregnet", {
      description: `Vedlikehold ca. ${res.tdee} kcal · mål ${res.target} kcal`,
    });
  };

  const submit = async () => {
    setSaving(true);
    try {
      const plan_type =
        calc.goalType === "ned"
          ? "Ned i vekt"
          : calc.goalType === "opp"
            ? "Bygg muskler"
            : "Vedlikehold";
      await persist({ data: { person, plan_type, ...vals } });
      toast.success("Mål oppdatert");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke lagre mål");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-widest">Mål for {person}</DialogTitle>
          <DialogDescription>Beregn behov automatisk, eller sett tallene selv.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-primary flex items-center gap-1">
              <Droplets className="h-3 w-3" /> Kalkulator
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={calc.sex}
                onChange={(e) => setCalc((c) => ({ ...c, sex: e.target.value }))}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="mann">Mann</option>
                <option value="kvinne">Kvinne</option>
              </select>
              <Input
                type="number"
                value={calc.age}
                onChange={(e) => setCalc((c) => ({ ...c, age: Number(e.target.value) }))}
                placeholder="Alder"
              />
              <Input
                type="number"
                value={calc.weightKg}
                onChange={(e) => setCalc((c) => ({ ...c, weightKg: Number(e.target.value) }))}
                placeholder="Vekt kg"
              />
              <Input
                type="number"
                value={calc.heightCm}
                onChange={(e) => setCalc((c) => ({ ...c, heightCm: Number(e.target.value) }))}
                placeholder="Høyde cm"
              />
              <select
                value={calc.activity}
                onChange={(e) => setCalc((c) => ({ ...c, activity: Number(e.target.value) }))}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value={1.2}>Stillesittende</option>
                <option value={1.375}>Lett aktiv</option>
                <option value={1.55}>Moderat aktiv</option>
                <option value={1.725}>Svært aktiv</option>
              </select>
              <select
                value={calc.goalType}
                onChange={(e) =>
                  setCalc((c) => ({
                    ...c,
                    goalType: e.target.value as "ned" | "vedlikehold" | "opp",
                  }))
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="ned">Ned i vekt</option>
                <option value="vedlikehold">Vedlikehold</option>
                <option value="opp">Bygg muskler</option>
              </select>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={applyCalc}>
              Beregn mål
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["calorie_goal", "Kalorier"],
                ["protein_goal", "Protein g"],
                ["carbs_goal", "Karbo g"],
                ["fat_goal", "Fett g"],
                ["fiber_goal", "Fiber g"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {label}
                </label>
                <Input
                  type="number"
                  value={vals[key]}
                  onChange={(e) => setVals((v) => ({ ...v, [key]: Number(e.target.value) }))}
                />
              </div>
            ))}
          </div>

          <Button className="w-full" onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Lagre mål
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
