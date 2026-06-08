// Visuelle effekter for støvsuger og gressklipper.
// Brukes på smart-dashbord, /gressklipper og /støvsugeren.

export const VacuumFX = ({ mode }: { mode: "suck" | "orbit" | "off" }) => {
  if (mode === "off") return null;
  const suck = [
    { dx: -34, dy: -22, d: "0s" },
    { dx: 30, dy: -24, d: "0.25s" },
    { dx: -28, dy: 24, d: "0.5s" },
    { dx: 34, dy: 22, d: "0.75s" },
    { dx: -38, dy: 2, d: "1s" },
    { dx: 36, dy: -4, d: "1.25s" },
  ];
  const orbit = [
    { r: 26, d: "0s" },
    { r: 30, d: "1.2s" },
    { r: 22, d: "2.4s" },
    { r: 28, d: "3.6s" },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {mode === "suck"
        ? suck.map((p, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 -ml-[2px] -mt-[2px] h-1 w-1 rounded-full bg-amber-200/80 animate-dust-suck"
              style={{
                ["--dx" as any]: `${p.dx}px`,
                ["--dy" as any]: `${p.dy}px`,
                animationDelay: p.d,
                boxShadow: "0 0 4px rgba(252,211,77,0.7)",
              }}
            />
          ))
        : orbit.map((p, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 -ml-[2px] -mt-[2px] h-1 w-1 rounded-full bg-amber-200/70 animate-dust-orbit"
              style={{ ["--r" as any]: `${p.r}px`, animationDelay: p.d }}
            />
          ))}
    </div>
  );
};

export const MowerFX = ({ mode }: { mode: "mow" | "wind" | "off" }) => {
  if (mode === "off") return null;
  const bladeBg = "linear-gradient(to top, hsl(140 70% 30%), hsl(140 70% 55%))";
  const mow = [
    { gx: 34, h: 12, d: "0s" },
    { gx: 40, h: 16, d: "0.35s" },
    { gx: 30, h: 10, d: "0.7s" },
    { gx: 38, h: 14, d: "1.05s" },
    { gx: 32, h: 11, d: "1.4s" },
  ];
  const wind = [
    { x: 30, h: 12, d: "0s" },
    { x: 36, h: 14, d: "0.6s" },
    { x: 42, h: 10, d: "1.2s" },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {mode === "mow"
        ? mow.map((b, i) => (
            <span
              key={i}
              className="absolute bottom-0 left-1/2 animate-grass-toward"
              style={{
                width: 2,
                height: b.h,
                borderRadius: 1,
                background: bladeBg,
                ["--gx" as any]: `${b.gx}px`,
                animationDelay: b.d,
              }}
            />
          ))
        : wind.map((b, i) => (
            <span
              key={i}
              className="absolute bottom-0 animate-grass-sway"
              style={{
                left: `calc(50% + ${b.x}px)`,
                width: 2,
                height: b.h,
                borderRadius: 1,
                background: bladeBg,
                animationDelay: b.d,
              }}
            />
          ))}
    </div>
  );
};
