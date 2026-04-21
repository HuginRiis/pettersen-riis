import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loginFn } from "@/server/auth";

/**
 * Custom event used to open the login dialog from anywhere in the app
 * without prop-drilling. Any component (header, hall cards, portal gate)
 * can dispatch `house-riis:open-login` and the dialog mounted at the root
 * will pop open over whatever page the visitor is on.
 */
export const OPEN_LOGIN_EVENT = "house-riis:open-login";

export function openLoginDialog() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_LOGIN_EVENT));
  }
}

export function LoginDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = () => {
      setError(null);
      setPassword("");
      setOpen(true);
    };
    window.addEventListener(OPEN_LOGIN_EVENT, handler);
    return () => window.removeEventListener(OPEN_LOGIN_EVENT, handler);
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await loginFn({ data: { password } });
      setOpen(false);
      setPassword("");
      await router.invalidate();
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noe gikk galt");
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setError(null);
          setLoading(false);
        }
      }}
    >
      <DialogContent className="max-w-md p-0 border-primary/40 bg-background overflow-hidden">
        <DialogTitle className="sr-only">Husets passord</DialogTitle>
        <DialogDescription className="sr-only">
          Skriv inn husets passord for å tre inn i borgens saler.
        </DialogDescription>
        <div className="p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="mx-auto w-14 h-14 rounded-full border border-primary/40 flex items-center justify-center text-primary text-2xl mb-3">
              ❦
            </div>
            <h2 className="text-display text-xl tracking-[0.3em] text-primary">HOUSE RIIS</h2>
            <p className="text-[10px] text-muted-foreground tracking-widest mt-1">OF SKIEN</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs tracking-wider uppercase text-muted-foreground mb-2">
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
            <p className="text-center text-xs text-muted-foreground tracking-wider pt-1">
              «Vinteren tilhører oss»
            </p>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
