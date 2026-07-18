import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Search, Sparkles, X } from "lucide-react";
import { searchIndex, type SearchEntry } from "@/lib/search-index";
import { aiSmartSearch, type SmartSearchResult } from "@/lib/smart-search.functions";
import { RainOnGlass } from "@/components/RainOnGlass";

export function SmartSearch() {
  const navigate = useNavigate();
  const aiFn = useServerFn(aiSmartSearch);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<SearchEntry[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<SmartSearchResult | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHits(searchIndex(query, 8));
    setAiResult(null);
  }, [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(path: string) {
    setOpen(false);
    setQuery("");
    navigate({ to: path });
  }

  async function runAi() {
    if (!query.trim()) return;
    setAiLoading(true);
    try {
      const res = await aiFn({ data: { query } });
      setAiResult(res);
    } catch (e: any) {
      setAiResult({ answer: `Feil: ${e?.message ?? String(e)}`, hits: [] });
    } finally {
      setAiLoading(false);
    }
  }

  const showDropdown = open && (query.length > 0 || aiResult !== null);

  return (
    <div ref={boxRef} className="container mx-auto px-4 mb-6 relative z-20">
      <div className="max-w-2xl mx-auto">
        <div className="relative flex items-center gap-2 bg-background/80 backdrop-blur border-2 border-primary/40 rounded-lg px-3 py-2 shadow-[0_0_18px_hsl(var(--primary)/0.25)] overflow-hidden">
          <RainOnGlass />
          <Search size={16} className="text-primary shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (hits.length > 0) go(hits[0].path);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Søk i borgen… (Gardena, økonomi, planter…)"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setAiResult(null);
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Tøm søk"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={runAi}
            disabled={!query.trim() || aiLoading}
            className="shrink-0 flex items-center gap-1 px-2 py-1 rounded border border-primary/50 text-primary text-[10px] tracking-[0.15em] uppercase hover:bg-primary/10 disabled:opacity-50"
            title="Spør AI om hva du leter etter"
          >
            <Sparkles size={12} />
            {aiLoading ? "…" : "AI"}
          </button>
        </div>

        {showDropdown && (
          <div className="absolute left-4 right-4 sm:left-auto sm:right-auto sm:w-full max-w-2xl mt-2 rounded-lg border border-border bg-background/95 backdrop-blur shadow-xl overflow-hidden">
            {aiResult && (
              <div className="border-b border-border bg-primary/5 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase text-primary mb-1">
                  <Sparkles size={11} /> AI-svar
                </div>
                {aiResult.answer && (
                  <p className="text-sm text-foreground mb-2">{aiResult.answer}</p>
                )}
                {aiResult.hits.length > 0 && (
                  <ul className="space-y-1">
                    {aiResult.hits.map((h) => (
                      <li key={h.path}>
                        <button
                          type="button"
                          onClick={() => go(h.path)}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-primary/10"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-primary">{h.title}</span>
                            <span className="text-[10px] font-mono text-muted-foreground">{h.path}</span>
                          </div>
                          {h.reason && (
                            <p className="text-xs text-muted-foreground mt-0.5">{h.reason}</p>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {hits.length > 0 ? (
              <ul className="max-h-80 overflow-y-auto">
                {hits.map((h) => (
                  <li key={h.path}>
                    <button
                      type="button"
                      onClick={() => go(h.path)}
                      className="w-full text-left px-3 py-2 hover:bg-primary/10 flex items-center justify-between gap-2 border-b border-border/40 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{h.title}</span>
                          <span className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground shrink-0">
                            {h.section}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {h.description}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        {h.path}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : query.length > 0 && !aiResult ? (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                Ingen direkte treff. Trykk <span className="text-primary">AI</span> for å spørre maesteren.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
