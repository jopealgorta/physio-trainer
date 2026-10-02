"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PainPoint } from "@/lib/adherence";
import { ATTENTION } from "@/lib/attention";
import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import { PAIN_MAX, PAIN_MIN } from "@/lib/session-logs";

const DAY_MS = 86_400_000;
const MAX_TICKS = 5;
const ALL = "#all";

/** Whole-day tick positions (UTC ms) from `first` to `last`, at most five, evenly spaced. */
export function tickDays(first: number, last: number): number[] {
  const days = Math.round((last - first) / DAY_MS);
  const step = Math.max(1, Math.ceil(days / (MAX_TICKS - 1)));
  const ticks: number[] = [];
  for (let day = 0; day <= days; day += step) ticks.push(first + day * DAY_MS);
  return ticks;
}

const toTime = (date: string) => calendarDateToDate(date).getTime();

/**
 * Pain over time (spec 13): the patient's ratings, averaged per day, overall or for one routine.
 * The line uses the `primary` token and a dashed `destructive` line marks where the dashboard
 * starts to flag a customer. Every point is also in a table for screen readers.
 */
export function PainChart({
  overall,
  routines,
}: {
  overall: PainPoint[];
  routines: { id: string; name: string; points: PainPoint[] }[];
}) {
  const t = useTranslations("Activity.pain");
  const format = useFormatter();
  const id = useId();
  const [selected, setSelected] = useState(ALL);

  const routine = routines.find((item) => item.id === selected);
  const points = routine ? routine.points : overall;
  const scope = routine ? routine.name : t("all");
  const day = (date: string) =>
    format.dateTime(calendarDateToDate(date), {
      ...CALENDAR_DATE_FORMAT,
      dateStyle: undefined,
      day: "numeric",
      month: "short",
    });

  const config = { pain: { label: t("series"), color: "var(--primary)" } } satisfies ChartConfig;
  const data = points.map((point) => ({ ts: toTime(point.date), pain: point.pain }));
  const first = data[0]?.ts;
  const last = data.at(-1)?.ts;
  const latest = points.at(-1);

  return (
    <section className="grid gap-3" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 id={`${id}-title`} className="text-base font-semibold">
          {t("title")}
        </h3>
        {routines.length > 1 ? (
          <div className="grid gap-1">
            <Label htmlFor={`${id}-routine`} className="text-muted-foreground text-xs">
              {t("routine")}
            </Label>
            <Select
              value={selected}
              onValueChange={(value) => {
                if (value !== "") setSelected(value);
              }}
            >
              <SelectTrigger id={`${id}-routine`} className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("all")}</SelectItem>
                {routines.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {latest && first !== undefined && last !== undefined ? (
        <>
          <div
            role="img"
            aria-label={t("summary", {
              scope,
              count: points.length,
              latest: latest.pain,
              date: day(latest.date),
            })}
          >
            <ChartContainer config={config} className="aspect-auto h-56 w-full" aria-hidden>
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={[first - DAY_MS, last + DAY_MS]}
                  ticks={tickDays(first, last)}
                  tickFormatter={(ts: number) => day(new Date(ts).toISOString().slice(0, 10))}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[PAIN_MIN, PAIN_MAX]}
                  ticks={[0, 2, 4, 6, 8, 10]}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <ReferenceLine
                  y={ATTENTION.highPain}
                  stroke="var(--destructive)"
                  strokeDasharray="4 4"
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(ts) => day(new Date(Number(ts)).toISOString().slice(0, 10))}
                      valueFormatter={(value) => t("tooltipValue", { value: Number(value) })}
                    />
                  }
                />
                <Line
                  dataKey="pain"
                  type="linear"
                  stroke="var(--color-pain)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--color-pain)" }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          </div>
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className="border-destructive inline-block w-5 border-t-2 border-dashed"
            />
            {t("threshold", { value: ATTENTION.highPain })}
          </p>
          <table className="sr-only">
            <caption>{t("table.caption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("table.date")}</th>
                <th scope="col">{t("table.pain")}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date}>
                  <td>{day(point.date)}</td>
                  <td>{point.pain}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      )}
    </section>
  );
}
