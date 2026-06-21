import type { Group, ScheduleEntry } from "../types";

export function fmtTime(e: ScheduleEntry): string {
  const f = (e.from || "").trim();
  const t = (e.to || "").trim();
  if (f && t) return `${f} - ${t}`;
  return f || (e.time || "").trim();
}

export function normalizeSchedule(schedule: ScheduleEntry[] = []): ScheduleEntry[] {
  return schedule.map((e) => {
    if (e.from !== undefined || e.to !== undefined) {
      return { day: e.day, from: e.from || "", to: e.to || "" };
    }
    const raw = (e.time || "").trim();
    const parts = raw.split(/\s*[-–]\s*|\s+to\s+/i);
    if (parts.length === 2) {
      return { day: e.day, from: parts[0].trim(), to: parts[1].trim() };
    }
    return { day: e.day, from: raw, to: "" };
  });
}

export function genMessage(schedule: ScheduleEntry[]): string {
  const v = schedule.filter((e) => (e.from || "").trim());
  if (!v.length) return "";
  return [
    "*Note*",
    "Schedule for this week:",
    "",
    ...v.map((e) => `* ${e.day}: ${fmtTime(e)}`),
    "*Kindly Acknowledge*",
  ].join("\n");
}

export function messageFor(g: Group): string {
  if (g.message?.trim()) return g.message;
  return genMessage(normalizeSchedule(g.schedule));
}

export function replaceTokens(text: string): string {
  const d = new Date();
  const date = d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const wd = d.toLocaleDateString(undefined, { weekday: "long" });
  return (text || "")
    .replace(/\{date\}/gi, date)
    .replace(/\{weekday\}/gi, wd);
}

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function emptyWeekSchedule(): ScheduleEntry[] {
  return WEEKDAYS.map((day) => ({ day, from: "", to: "" }));
}
