/**
 * Gardena Smart System v2 — kjente lastErrorCode-verdier for Sileno.
 * Kilde: Husqvarna/Gardena Smart System API-dokumentasjon.
 * Oversettelser er kortfattede norske forklaringer.
 */

export type GardenaErrorSeverity = "info" | "warn" | "error";

export type GardenaErrorCode = {
  code: string;
  label: string;
  description: string;
  severity: GardenaErrorSeverity;
};

export const GARDENA_ERROR_CODES: GardenaErrorCode[] = [
  { code: "NO_MESSAGE", label: "Ingen melding", description: "Ingen aktiv feil registrert.", severity: "info" },
  { code: "OUTSIDE_WORKING_AREA", label: "Utenfor arbeidsområde", description: "Klipperen har kommet seg utenfor begrensningskabelen.", severity: "error" },
  { code: "NO_LOOP_SIGNAL", label: "Mangler sløyfesignal", description: "Får ikke signal fra begrensningskabelen. Sjekk ladestasjon og kabel.", severity: "error" },
  { code: "WRONG_LOOP_SIGNAL", label: "Feil sløyfesignal", description: "Mottar feil eller forstyrret signal fra begrensningskabelen.", severity: "error" },
  { code: "LOOP_SENSOR_PROBLEM_FRONT", label: "Sensorfeil foran", description: "Problem med fremre sløyfesensor.", severity: "error" },
  { code: "LOOP_SENSOR_PROBLEM_REAR", label: "Sensorfeil bak", description: "Problem med bakre sløyfesensor.", severity: "error" },
  { code: "TRAPPED", label: "Fastlåst", description: "Klipperen står fast og kommer seg ikke videre.", severity: "error" },
  { code: "UPSIDE_DOWN", label: "Veltet", description: "Klipperen ligger opp/ned.", severity: "error" },
  { code: "LOW_BATTERY", label: "Lavt batteri", description: "Batteriet er nesten tomt — søker hjem.", severity: "warn" },
  { code: "EMPTY_BATTERY", label: "Tomt batteri", description: "Batteriet er helt tomt og må lades manuelt.", severity: "error" },
  { code: "NO_DRIVE", label: "Ingen fremdrift", description: "Klarer ikke å bevege seg — sjekk hjul og underlag.", severity: "error" },
  { code: "TEMPORARILY_LIFTED", label: "Midlertidig løftet", description: "Klipperen ble løftet kortvarig.", severity: "warn" },
  { code: "LIFTED", label: "Løftet", description: "Klipperen er løftet og stoppet.", severity: "warn" },
  { code: "STUCK_IN_CHARGING_STATION", label: "Fast i ladestasjon", description: "Kommer seg ikke ut av ladestasjonen.", severity: "error" },
  { code: "CHARGING_STATION_BLOCKED", label: "Ladestasjon blokkert", description: "Noe står i veien for ladestasjonen.", severity: "error" },
  { code: "COLLISION_SENSOR_PROBLEM_REAR", label: "Kollisjonsfeil bak", description: "Problem med bakre kollisjonssensor.", severity: "error" },
  { code: "COLLISION_SENSOR_PROBLEM_FRONT", label: "Kollisjonsfeil foran", description: "Problem med fremre kollisjonssensor.", severity: "error" },
  { code: "WHEEL_MOTOR_BLOCKED_RIGHT", label: "Høyre hjul blokkert", description: "Høyre drivhjul er blokkert — sjekk for gress/grener.", severity: "error" },
  { code: "WHEEL_MOTOR_BLOCKED_LEFT", label: "Venstre hjul blokkert", description: "Venstre drivhjul er blokkert — sjekk for gress/grener.", severity: "error" },
  { code: "WHEEL_DRIVE_PROBLEM_RIGHT", label: "Feil på høyre drivverk", description: "Problem med høyre hjulmotor.", severity: "error" },
  { code: "WHEEL_DRIVE_PROBLEM_LEFT", label: "Feil på venstre drivverk", description: "Problem med venstre hjulmotor.", severity: "error" },
  { code: "WHEEL_MOTOR_OVERLOADED_RIGHT", label: "Høyre hjul overbelastet", description: "Høyre hjulmotor er overbelastet.", severity: "error" },
  { code: "WHEEL_MOTOR_OVERLOADED_LEFT", label: "Venstre hjul overbelastet", description: "Venstre hjulmotor er overbelastet.", severity: "error" },
  { code: "CUTTING_MOTOR_DRIVE_DEFECT", label: "Feil på klippemotor", description: "Defekt i klippemotoren.", severity: "error" },
  { code: "CUTTING_SYSTEM_BLOCKED", label: "Klippesystem blokkert", description: "Knivskive eller motor er blokkert — sjekk for gjenstander.", severity: "error" },
  { code: "INVALID_SUB_DEVICE_COMBINATION", label: "Ugyldig enhet-kombinasjon", description: "Komponenter passer ikke sammen.", severity: "error" },
  { code: "SETTINGS_RESTORED", label: "Innstillinger tilbakestilt", description: "Innstillinger ble gjenopprettet til standard.", severity: "info" },
  { code: "ELECTRONIC_PROBLEM", label: "Elektronikkfeil", description: "Generelt elektronikkproblem.", severity: "error" },
  { code: "CHARGING_SYSTEM_PROBLEM", label: "Feil i ladesystem", description: "Problem med ladesystemet.", severity: "error" },
  { code: "TILT_SENSOR_PROBLEM", label: "Feil på tiltsensor", description: "Problem med helningssensoren.", severity: "error" },
  { code: "CHARGING_CURRENT_TOO_HIGH", label: "For høy ladestrøm", description: "Ladestrømmen er for høy.", severity: "error" },
  { code: "ELECTRONIC_TEMPERATURE_TOO_HIGH", label: "Elektronikk for varm", description: "Elektronikken er overopphetet.", severity: "error" },
  { code: "BATTERY_PROBLEM", label: "Batteriproblem", description: "Generelt problem med batteriet.", severity: "error" },
  { code: "BATTERY_OVER_HEATING", label: "Batteri overopphetet", description: "Batteriet er for varmt.", severity: "error" },
  { code: "ALARM_MOWER_SWITCHED_OFF", label: "Alarm: skrudd av", description: "Klipperen ble slått av (alarm).", severity: "warn" },
  { code: "ALARM_MOWER_STOPPED", label: "Alarm: stoppet", description: "Klipperen ble stoppet (alarm).", severity: "warn" },
  { code: "ALARM_MOWER_LIFTED", label: "Alarm: løftet", description: "Klipperen ble løftet (alarm).", severity: "warn" },
  { code: "ALARM_MOWER_TILTED", label: "Alarm: tippet", description: "Klipperen ble tippet (alarm).", severity: "warn" },
  { code: "ALARM_MOWER_IN_MOTION", label: "Alarm: i bevegelse", description: "Klipperen ble beveget mens den var låst (alarm).", severity: "warn" },
  { code: "ALARM_OUTSIDE_GEOFENCE", label: "Alarm: utenfor geofence", description: "Klipperen er utenfor sitt geo-område (alarm).", severity: "warn" },
  { code: "SLIPPED", label: "Glir", description: "Hjulene glir — for bratt eller glatt underlag.", severity: "warn" },
  { code: "DAY_ACTIVE_LIMIT_REACHED", label: "Dagens grense nådd", description: "Maks aktiv tid for dagen er brukt opp.", severity: "info" },
];

export const GARDENA_ERROR_BY_CODE: Record<string, GardenaErrorCode> = Object.fromEntries(
  GARDENA_ERROR_CODES.map((e) => [e.code, e]),
);

export function lookupGardenaError(code: string | null | undefined): GardenaErrorCode | null {
  if (!code) return null;
  return GARDENA_ERROR_BY_CODE[code.toUpperCase()] ?? null;
}
