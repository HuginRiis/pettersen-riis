export type AlertGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] }
  | { type: "Point"; coordinates: number[] }
  | null;

export type TelemarkAlert = {
  id: string;
  event: string;
  eventAwarenessName: string | null;
  severity: string | null;
  riskMatrixColor: string | null;
  area: string | null;
  description: string | null;
  instruction: string | null;
  consequences: string | null;
  start: string | null;
  end: string | null;
  counties: string[];
  countyNames: string[];
  geometry: AlertGeometry;
};
