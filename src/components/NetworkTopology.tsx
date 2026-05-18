import { Wifi, Cable, Router as RouterIcon, Smartphone } from "lucide-react";
import type { NetworkDevice } from "@/server/network.functions";

/**
 * Tegner et enkelt nettverkskart:
 *   internett ── hovedruter ── (wifi/ethernet) ── andre rutere/klienter
 * Klassifiserer kabel vs wifi basert på enhetens capabilities/navn.
 */
export function NetworkTopology({
  routers,
  clients,
}: {
  routers: NetworkDevice[];
  clients: NetworkDevice[];
}) {
  const main = routers[0] ?? null;
  const meshNodes = routers.slice(1);
  const wired = clients.filter((c) => isWired(c));
  const wireless = clients.filter((c) => !isWired(c));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox="0 0 720 360" className="w-full h-auto min-w-[640px]" role="img" aria-label="Nettverkskart">
        <defs>
          <linearGradient id="net-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="oklch(0.20 0.04 250)" />
            <stop offset="1" stopColor="oklch(0.12 0.03 250)" />
          </linearGradient>
          <linearGradient id="wifi-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#38bdf8" stopOpacity="0.9" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="cable-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#facc15" stopOpacity="0.9" />
            <stop offset="1" stopColor="#facc15" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="720" height="360" rx="12" fill="url(#net-bg)" />

        {/* Internett */}
        <g transform="translate(60,170)">
          <circle r="26" fill="oklch(0.30 0.10 250)" stroke="#38bdf8" strokeWidth="2" />
          <text x="0" y="4" textAnchor="middle" fontSize="11" fill="#e2e8f0">Internett</text>
          <text x="0" y="-44" textAnchor="middle" fontSize="10" fill="#94a3b8">WAN</text>
        </g>

        {/* Hovedruter */}
        <line x1="86" y1="170" x2="200" y2="170" stroke="url(#cable-line)" strokeWidth="3" strokeDasharray="0" />
        <g transform="translate(230,170)">
          <circle r="34" fill="oklch(0.32 0.13 280)" stroke="#a78bfa" strokeWidth="2" />
          <text x="0" y="-2" textAnchor="middle" fontSize="11" fill="#f1f5f9" fontWeight="600">
            {short(main?.name) ?? "Hoved-Deco"}
          </text>
          <text x="0" y="12" textAnchor="middle" fontSize="9" fill="#cbd5e1">XE75 · WAN</text>
        </g>

        {/* Mesh-rutere */}
        {meshNodes.map((r, i) => {
          const x = 460;
          const y = i === 0 ? 80 : i === 1 ? 280 : 180;
          return (
            <g key={r.id}>
              <path
                d={`M 264 170 Q 360 ${y} ${x - 30} ${y}`}
                stroke="url(#wifi-line)"
                strokeWidth="2.5"
                fill="none"
                strokeDasharray="6 4"
              />
              <g transform={`translate(${x},${y})`}>
                <circle r="28" fill="oklch(0.30 0.10 220)" stroke="#38bdf8" strokeWidth="2" />
                <text x="0" y="-2" textAnchor="middle" fontSize="10" fill="#f1f5f9" fontWeight="600">
                  {short(r.name) ?? `Mesh ${i + 1}`}
                </text>
                <text x="0" y="11" textAnchor="middle" fontSize="9" fill="#cbd5e1">
                  {r.signal != null ? `${Math.round(r.signal)} dBm` : "wifi"}
                </text>
              </g>
            </g>
          );
        })}

        {/* Klienter — kabel (gule) */}
        {wired.slice(0, 4).map((c, i) => {
          const x = 600;
          const y = 60 + i * 50;
          return (
            <g key={c.id}>
              <line x1="264" y1="170" x2={x - 18} y2={y} stroke="url(#cable-line)" strokeWidth="2" />
              <g transform={`translate(${x},${y})`}>
                <circle r="14" fill="oklch(0.35 0.12 80)" stroke="#facc15" strokeWidth="1.5" />
                <text x="0" y="3" textAnchor="middle" fontSize="9" fill="#fef9c3">{short(c.name, 8)}</text>
              </g>
            </g>
          );
        })}

        {/* Klienter — wifi (cyan) */}
        {wireless.slice(0, 6).map((c, i) => {
          const x = 640;
          const y = 60 + i * 42;
          return (
            <g key={c.id}>
              <path
                d={`M 488 ${180} Q 560 ${y} ${x - 14} ${y}`}
                stroke="url(#wifi-line)"
                strokeWidth="1.6"
                fill="none"
                strokeDasharray="4 4"
              />
              <g transform={`translate(${x},${y})`}>
                <circle r="13" fill="oklch(0.30 0.10 230)" stroke="#38bdf8" strokeWidth="1.5" />
                <text x="0" y="3" textAnchor="middle" fontSize="9" fill="#e0f2fe">{short(c.name, 8)}</text>
              </g>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Cable size={12} className="text-yellow-400" /> Kabel</span>
        <span className="inline-flex items-center gap-1.5"><Wifi size={12} className="text-sky-400" /> Wi-Fi</span>
        <span className="inline-flex items-center gap-1.5"><RouterIcon size={12} className="text-violet-400" /> Deco-ruter</span>
        <span className="inline-flex items-center gap-1.5"><Smartphone size={12} /> Klient</span>
      </div>
    </div>
  );
}

function isWired(d: NetworkDevice): boolean {
  const n = (d.name ?? "").toLowerCase();
  if (n.includes("eth") || n.includes("kabel") || n.includes("lan") || n.includes("nas") || n.includes("pc") || n.includes("server")) {
    return true;
  }
  const caps = d.capabilities ?? {};
  if ("link_speed" in caps || "ethernet" in caps) return true;
  return false;
}

function short(s: string | null | undefined, max = 10): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
