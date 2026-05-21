import { Outlet, Link, createRootRoute, HeadContent, Scripts, redirect } from "@tanstack/react-router";
import { checkAuth } from "@/server/auth";
import { VisitorTracker } from "@/components/VisitorTracker";
import { LoginDialog } from "@/components/LoginDialog";
import { PullToRefresh } from "@/components/PullToRefresh";
import { LastRouteMemory } from "@/components/LastRouteMemory";
import { AppearanceApplier } from "@/components/AppearanceApplier";
import { PageLoadTracker } from "@/components/PageLoadTracker";

// Routes that are accessible without logging in (visitors entering the castle gates).
// Locked routes now redirect to "/" (where the login dialog opens automatically) instead
// of a dedicated /login page.
const PUBLIC_PATHS = new Set<string>(["/", "/var", "/pollen", "/turer", "/got-saga", "/hytta", "/varsler"]);

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    // Public paths that do not require auth — visitors may enter the courtyard freely
    if (PUBLIC_PATHS.has(location.pathname)) return;
    const { authenticated } = await checkAuth();
    if (!authenticated) {
      // Send the wanderer back to the great hall — the login dialog will pop up there.
      throw redirect({ to: "/", search: { login: "1" } as never });
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Arne & Rebekka av Skien" },
      { name: "description", content: "Den digitale storsalen til Arne Pettersen Riis og Rebekka Riis Pettersen i Skien." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "Arne & Rebekka av Skien" },
      { name: "twitter:title", content: "Arne & Rebekka av Skien" },
      { property: "og:description", content: "Den digitale storsalen til Arne Pettersen Riis og Rebekka Riis Pettersen i Skien." },
      { name: "twitter:description", content: "Den digitale storsalen til Arne Pettersen Riis og Rebekka Riis Pettersen i Skien." },
      { name: "apple-mobile-web-app-title", content: "Skien´s huset" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "theme-color", content: "#1a1d24" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <>
      <AppearanceApplier />
      <PullToRefresh />
      <VisitorTracker />
      <LastRouteMemory />
      <Outlet />
      <LoginDialog />
    </>
  );
}
