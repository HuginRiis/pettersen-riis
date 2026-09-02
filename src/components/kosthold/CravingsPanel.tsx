import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Search } from "lucide-react";
import {
  CRAVINGS,
  CRAVING_EMOTION,
  CRAVING_REASONS,
  CRAVING_TIPS,
} from "@/lib/cravings-data";

export function CravingsPanel() {
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return CRAVINGS;
    return CRAVINGS.filter((c) =>
      [c.title, c.summary, c.swap, ...c.tags, ...c.causes.flatMap((x) => [x.title, x.text])]
        .join(" ")
        .toLowerCase()
        .includes(s),
    );
  }, [q]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-widest">
            Sug dekodet · hva kroppen prøver å si
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Søk på det du har lyst på – så får du de vanligste årsakene og et sunt bytte.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Søk: sjokolade, chips, kaffe, brød, is …"
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["sukker", "salt", "sjokolade", "kaffe", "brød", "ost", "is", "chili"].map((t) => (
              <button
                key={t}
                onClick={() => setQ(t)}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                {t}
              </button>
            ))}
            {q && (
              <button
                onClick={() => setQ("")}
                className="rounded-full border border-primary/60 px-2.5 py-1 text-[11px] uppercase tracking-widest text-primary"
              >
                Nullstill
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-widest">Hvorfor får vi sug?</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          {CRAVING_REASONS.map((r) => (
            <div key={r.title} className="rounded-md border border-border p-2">
              <div className="text-xs font-medium text-primary uppercase tracking-widest">
                {r.title}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">{r.text}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-widest">
            De 10 vanligste suga {q && `· ${list.length} treff`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-xs text-muted-foreground">Ingen treff. Prøv et annet ord.</p>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {list.map((c) => (
                <AccordionItem key={c.key} value={c.key}>
                  <AccordionTrigger className="text-left">
                    <span className="flex items-center gap-2">
                      <span aria-hidden>{c.emoji}</span>
                      <span className="text-xs font-medium">{c.title}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    <p className="text-[11px] text-muted-foreground">{c.summary}</p>
                    <div className="space-y-1.5">
                      {c.causes.map((x) => (
                        <div key={x.title} className="border-l-2 border-primary/60 pl-2">
                          <div className="text-xs font-medium">{x.title}</div>
                          <div className="text-[11px] text-muted-foreground">{x.text}</div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <div className="text-[11px] font-medium uppercase tracking-widest text-primary">
                        Sunt bytte
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{c.swap}</div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase tracking-widest">
              Fysisk eller følelsesmessig?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {CRAVING_EMOTION.map((e) => (
              <div key={e.title} className="border-l-2 border-primary/60 pl-2">
                <div className="text-xs font-medium">{e.title}</div>
                <div className="text-[11px] text-muted-foreground">{e.text}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase tracking-widest">Slik demper du suget</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {CRAVING_TIPS.map((t) => (
              <div key={t.title} className="rounded-md border border-border p-2">
                <div className="text-xs font-medium text-primary uppercase tracking-widest">
                  {t.title}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{t.text}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        Fritt bearbeidet til norsk fra Paula Grubb Nutrition · «Top 10 cravings decoded». Erstatter
        ikke medisinsk rådgivning.
      </p>
    </div>
  );
}
