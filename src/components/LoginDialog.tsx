import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loginFn, logoutFn, getWelcomeInfo } from "@/server/auth";
import { LogIn, LogOut, Clock, MapPin } from "lucide-react";

/**
 * Custom event used to open the welcome / login dialog from anywhere in the app.
 */
export const OPEN_LOGIN_EVENT = "house-riis:open-login";

export function openLoginDialog() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_LOGIN_EVENT));
  }
}

type WelcomeInfo = {
  authenticated: boolean;
  who: string | null;
  ip: string | null;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
};

function formatNo(dt: string | null): string {
  if (!dt) return "—";
  try {
    const d = new Date(dt);
    return d.toLocaleString("nb-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dt;
  }
}

export function LoginDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<WelcomeInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);

  const refreshInfo = async () => {
    setInfoLoading(true);
    try {
      let endpoint: string | null = null;
      let storedWho: string | null = null;
      try {
        const { getCurrentSubscriptionDetails, getStoredWho } = await import("@/lib/push-client");
        const sub = await getCurrentSubscriptionDetails();
        if (sub) endpoint = sub.endpoint;
        storedWho = getStoredWho();
      } catch {
        /* ignore */
      }
      const data = (await getWelcomeInfo({ data: { endpoint, storedWho } })) as WelcomeInfo;
      setInfo(data);
    } catch {
      setInfo(null);
    } finally {
      setInfoLoading(false);
    }
  };

  useEffect(() => {
    const handler = () => {
      setError(null);
      setPassword("");
      setOpen(true);
      void refreshInfo();
    };
    window.addEventListener(OPEN_LOGIN_EVENT, handler);
    return () => window.removeEventListener(OPEN_LOGIN_EVENT, handler);
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let who: string | null = null;
      try {
        const { getStoredWho } = await import("@/lib/push-client");
        const w = getStoredWho();
        if (w && w !== "Alle") who = w;
      } catch {
        /* ignore */
      }
      await loginFn({ data: { password, who } });
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

  const onLogout = async () => {
    setLoading(true);
    try {
      await logoutFn();
      setOpen(false);
      await router.invalidate();
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch {
      setLoading(false);
    }
  };

  const greetingName =
    info?.who && info.who !== "Alle" ? info.who : info?.ip ? `gjest (${info.ip})` : "vandrer";

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
        <DialogTitle className="sr-only">Velkommen til House Riis</DialogTitle>
        <DialogDescription className="sr-only">
          Velkomstdialog med innlogging, utlogging og informasjon om siste besøk.
        </DialogDescription>
        <div className="p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="mx-auto w-14 h-14 rounded-full border border-primary/40 flex items-center justify-center text-primary text-2xl mb-3">
              ❦
            </div>
            <h2 className="text-display text-xl tracking-[0.3em] text-primary">HOUSE RIIS</h2>
            <p className="text-[10px] text-muted-foreground tracking-widest mt-1">OF SKIEN</p>
          </div>

          {/* Greeting */}
          <div className="text-center mb-5">
            <p className="text-sm text-foreground">
              Velkommen tilbake, <span className="text-primary font-medium">{greetingName}</span>
            </p>
          </div>

          {/* Password / logout — TOP */}
          {info?.authenticated ? (
            <div className="space-y-3 mb-5">
              <Button onClick={onLogout} disabled={loading} variant="outline" className="w-full">
                <LogOut className="w-4 h-4 mr-2" />
                {loading ? "Lukker porten…" : "Logg ut"}
              </Button>
              <Button onClick={() => setOpen(false)} className="w-full">
                Fortsett i borgen
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4 mb-5" method="post" action="#">
              {/* Hidden username so iOS Keychain / password managers can save the credential */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                value="house-riis"
                readOnly
                hidden
                aria-hidden="true"
                tabIndex={-1}
              />
              <div>
                <label
                  htmlFor="house-riis-password"
                  className="block text-xs tracking-wider uppercase text-muted-foreground mb-2"
                >
                  Husets passord
                </label>
                <Input
                  id="house-riis-password"
                  name="password"
                  type="password"
                  autoFocus
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=""
                  className="bg-background/60"
                />
              </div>
              {error && (
                <div className="text-sm text-destructive border border-destructive/40 rounded-md px-3 py-2 bg-destructive/10">
                  {error}
                </div>
              )}
              <Button type="submit" disabled={loading || !password} className="w-full">
                <LogIn className="w-4 h-4 mr-2" />
                {loading ? "Åpner porten…" : "Logg inn"}
              </Button>
            </form>
          )}

          {/* Last visit info — BOTTOM */}
          <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 space-y-2 text-xs">
            {infoLoading && !info ? (
              <p className="text-muted-foreground text-center">Henter krønikene…</p>
            ) : (
              <>
                <div className="flex items-start gap-2 text-muted-foreground">
                  <LogIn className="w-3.5 h-3.5 mt-0.5 text-primary/70 shrink-0" />
                  <div className="flex-1">
                    <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      Sist innlogget
                    </span>
                    <span className="text-foreground">{formatNo(info?.lastLoginAt ?? null)}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 mt-0.5 text-primary/70 shrink-0" />
                  <div className="flex-1">
                    <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      Sist besøk
                    </span>
                    <span className="text-foreground">{formatNo(info?.lastSeenAt ?? null)}</span>
                  </div>
                </div>
                {info?.ip && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 text-primary/70 shrink-0" />
                    <div className="flex-1">
                      <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        Din adresse
                      </span>
                      <span className="text-foreground">{info.ip}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground tracking-wider pt-4">
            «Vinteren tilhører oss»
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
