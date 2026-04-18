import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { checkAuth, loginFn } from "@/server/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const { authenticated } = await checkAuth();
    if (authenticated) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({
    meta: [{ title: "House Riis Pettersen — Inngang til storsalen" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await loginFn({ data: { password } });
      await router.invalidate();
      router.navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noe gikk galt");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-full border border-primary/40 flex items-center justify-center text-primary text-3xl mb-4">
            ❦
          </div>
          <h1 className="text-display text-2xl tracking-[0.3em] text-primary">HOUSE RIIS</h1>
          <p className="text-xs text-muted-foreground tracking-widest mt-1">OF SKIEN</p>
        </div>
        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-border bg-card/60 backdrop-blur p-6 space-y-4 shadow-lg"
        >
          <div>
            <label className="block text-sm tracking-wider uppercase text-muted-foreground mb-2">
              Husets passord
            </label>
            <Input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-background/60"
            />
          </div>
          {error && (
            <div className="text-sm text-destructive border border-destructive/40 rounded-md px-3 py-2 bg-destructive/10">
              {error}
            </div>
          )}
          <Button type="submit" disabled={loading || !password} className="w-full">
            {loading ? "Åpner porten…" : "Tre inn"}
          </Button>
          <p className="text-center text-xs text-muted-foreground tracking-wider pt-2">
            «Vinteren tilhører oss»
          </p>
        </form>
      </div>
    </div>
  );
}
