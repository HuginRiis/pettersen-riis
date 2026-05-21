import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CronJobRow = {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  /** Beskrivelse for visning: "hvert minutt", "hver 5. min", "daglig 03:15", "kun ved bruk" */
  description: string;
  /** Parsed: hvis det er et N-minutters intervall-mønster, returnerer N. Ellers null. */
  intervalMinutes: number | null;
  /** Hvilken modus jobben er i nå. */
  mode: "cron" | "on-demand";
};

function describeSchedule(schedule: string, active: boolean): {
  description: string;
  intervalMinutes: number | null;
} {
  if (!active) return { description: "kun ved bruk", intervalMinutes: null };
  const s = schedule.trim();
  if (s === "* * * * *") return { description: "hvert minutt", intervalMinutes: 1 };
  const mEvery = /^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/.exec(s);
  if (mEvery) {
    const n = Number(mEvery[1]);
    return { description: `hver ${n}. min`, intervalMinutes: n };
  }
  const mHourly = /^0\s+\*\/(\d+)\s+\*\s+\*\s+\*$/.exec(s);
  if (mHourly) {
    const n = Number(mHourly[1]);
    return { description: `hver ${n}. time`, intervalMinutes: n * 60 };
  }
  const mDaily = /^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/.exec(s);
  if (mDaily) {
    const min = String(mDaily[1]).padStart(2, "0");
    const hr = String(mDaily[2]).padStart(2, "0");
    return { description: `daglig ${hr}:${min}`, intervalMinutes: null };
  }
  return { description: s, intervalMinutes: null };
}

export const listCronJobs = createServerFn({ method: "GET" }).handler(
  async (): Promise<CronJobRow[]> => {
    const { data, error } = await (supabaseAdmin as any).rpc("get_cron_jobs");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      jobid: number;
      jobname: string;
      schedule: string;
      active: boolean;
      command: string;
    }>;
    return rows.map((r) => {
      const { description, intervalMinutes } = describeSchedule(r.schedule, r.active);
      return {
        jobid: Number(r.jobid),
        jobname: r.jobname,
        schedule: r.schedule,
        active: r.active,
        description,
        intervalMinutes,
        mode: r.active ? "cron" : "on-demand",
      };
    });
  },
);

export const setCronJobConfig = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      jobid: z.number().int().positive(),
      mode: z.enum(["cron", "on-demand"]),
      minutes: z.number().int().min(1).max(10080).optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    if (data.mode === "cron" && (!data.minutes || data.minutes < 1)) {
      throw new Error("Minutter må være minst 1 i cron-modus");
    }
    const { error } = await (supabaseAdmin as any).rpc("set_cron_job_config", {
      p_jobid: data.jobid,
      p_mode: data.mode,
      p_minutes: data.mode === "cron" ? data.minutes : null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
