import { Document, Image, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";

import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import { type Weekday, WEEKDAYS, weekdayName } from "@/lib/plans";
import { qrCode } from "@/lib/qr";

import type {
  ExportBlock,
  ExportDocument,
  ExportItem,
  ExportPhase,
  ExportPlan,
  ExportRoutine,
} from "../model";
import { type ExportTranslate, frequencyLine } from "../translate";
import { PDF_FONT } from "./fonts";

/** Greyscale-safe palette: the PDF is often printed in black and white. */
const FOREGROUND = "#171717";
const SECONDARY = "#525252";
const MUTED = "#737373";
const RULE = "#d4d4d4";
const LIGHT_RULE = "#e5e5e5";
const PLACEHOLDER = "#f5f5f5";
const GROUP_RULE = "#a3a3a3";
const BOX_BORDER = "#525252";

const INSTRUCTIONS_MAX = 280;
const BOX = 10;
const BOX_COLUMN = 14;

const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT,
    fontSize: 10,
    color: FOREGROUND,
    paddingTop: 32,
    paddingHorizontal: 32,
    paddingBottom: 96,
    // No lineHeight here: react-pdf 4.9 then lays the fixed footer out at the top of a page that
    // starts with a break and drops its border and page number. Set it per text style instead.
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { flexDirection: "row", alignItems: "center", flexShrink: 1, marginRight: 16 },
  logo: { height: 40, maxWidth: 120, objectFit: "contain", marginRight: 12 },
  clinicName: { fontSize: 12, fontWeight: 700 },
  contact: { fontSize: 8.5, color: SECONDARY, marginTop: 2 },
  audience: { alignItems: "flex-end", flexShrink: 0 },
  audienceName: { fontSize: 10, fontWeight: 700 },
  audienceDate: { fontSize: 8.5, color: SECONDARY, marginTop: 2 },
  title: { fontSize: 18, fontWeight: 700, marginTop: 18, lineHeight: 1.2 },
  rule: { borderBottomWidth: 1, borderBottomColor: RULE, marginTop: 10, marginBottom: 16 },
  nothing: { fontSize: 11, color: SECONDARY },
  sectionTitle: { fontSize: 14, fontWeight: 700, lineHeight: 1.2 },
  meta: { fontSize: 9, color: SECONDARY, marginTop: 3 },
  notes: { fontSize: 9.5, marginTop: 6, lineHeight: 1.3 },
  caption: {
    fontSize: 7.5,
    fontWeight: 700,
    color: SECONDARY,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  weekTitle: { marginTop: 14, marginBottom: 4 },
  weekRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    paddingVertical: 5,
  },
  weekRowFirst: { borderTopWidth: 0.5, borderTopColor: RULE },
  weekDay: { width: 90, fontWeight: 700, fontSize: 9.5 },
  weekEntries: { flex: 1, fontSize: 9.5, lineHeight: 1.3 },
  rest: { color: MUTED },
  trackHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 12,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
  },
  trackHint: { flex: 1, fontSize: 8, color: MUTED },
  boxes: { flexDirection: "row", width: BOX_COLUMN * 7, marginLeft: 8 },
  boxColumn: { width: BOX_COLUMN, alignItems: "center" },
  initial: { fontSize: 8, fontWeight: 700, color: SECONDARY, textAlign: "center" },
  box: { width: BOX, height: BOX, borderWidth: 1, borderColor: BOX_BORDER, marginTop: 1 },
  items: { marginTop: 4 },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: LIGHT_RULE,
  },
  thumb: { width: 80, height: 45, marginRight: 10, objectFit: "cover", borderRadius: 2 },
  thumbPlaceholder: {
    width: 80,
    height: 45,
    marginRight: 10,
    backgroundColor: PLACEHOLDER,
    borderRadius: 2,
  },
  body: { flex: 1 },
  name: { fontSize: 10.5, fontWeight: 700, lineHeight: 1.2 },
  itemLabel: { color: SECONDARY },
  summary: { fontSize: 9.5, marginTop: 2, lineHeight: 1.3 },
  itemNotes: { fontSize: 9, color: SECONDARY, marginTop: 2, lineHeight: 1.3 },
  notesLabel: { fontWeight: 700 },
  instructions: { fontSize: 8.5, color: SECONDARY, marginTop: 3, lineHeight: 1.35 },
  group: { borderLeftWidth: 2, borderLeftColor: GROUP_RULE, paddingLeft: 8 },
  groupFirst: { marginTop: 8 },
  groupCaption: { paddingTop: 4 },
  sectionSpaced: { marginTop: 28 },
  footer: {
    position: "absolute",
    left: 32,
    right: 32,
    bottom: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 0.5,
    borderTopColor: RULE,
    paddingTop: 8,
  },
  share: { flexDirection: "row", alignItems: "center", flexShrink: 1, marginRight: 16 },
  qr: { width: 56, height: 56, marginRight: 10 },
  scan: { fontSize: 8.5, fontWeight: 700 },
  url: { fontSize: 8, color: SECONDARY, marginTop: 2 },
  // A render-prop Text is measured before it has content: give it room up front.
  pageNumber: { fontSize: 8, color: SECONDARY, width: 120, textAlign: "right", flexShrink: 0 },
});

/**
 * At most `max` characters (code points), ending in "…" when cut. Cuts at the last word break
 * when one is in the second half, so a word is not chopped mid-way.
 */
export function truncateText(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  let kept = chars.slice(0, max - 1);
  if (!/\s/.test(chars[max - 1])) {
    const lastSpace = kept.findLastIndex((char) => /\s/.test(char));
    if (lastSpace >= max / 2) kept = kept.slice(0, lastSpace);
  }
  return `${kept.join("").trimEnd()}…`;
}

const formatDay = (locale: string, day: string) =>
  new Intl.DateTimeFormat(locale, CALENDAR_DATE_FORMAT).format(calendarDateToDate(day));

function phaseLine(phase: ExportPhase | null, locale: string, t: ExportTranslate): string | null {
  if (!phase) return null;
  const parts: string[] = [];
  if (phase.label) parts.push(t("pdf.phase", { label: phase.label }));
  const { startsOn, endsOn } = phase;
  if (startsOn && endsOn) {
    parts.push(
      t("pdf.dateRange", { from: formatDay(locale, startsOn), to: formatDay(locale, endsOn) }),
    );
  } else if (startsOn) {
    parts.push(t("pdf.from", { date: formatDay(locale, startsOn) }));
  } else if (endsOn) {
    parts.push(t("pdf.until", { date: formatDay(locale, endsOn) }));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

type Context = {
  doc: ExportDocument;
  t: ExportTranslate;
  thumbnails: Map<string, string>;
};

function Header({ doc, t, logo }: Context & { logo: string | null }) {
  const { branding } = doc;
  const contact = branding.contact
    ? [branding.contact.email, branding.contact.phone, branding.contact.website].filter(Boolean)
    : [];
  return (
    <View>
      <View style={styles.header}>
        <View style={styles.brand}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt. */}
          {logo ? <Image src={logo} style={styles.logo} /> : null}
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.clinicName}>{branding.clinicName}</Text>
            {contact.length > 0 ? <Text style={styles.contact}>{contact.join(" · ")}</Text> : null}
          </View>
        </View>
        <View style={styles.audience}>
          <Text style={styles.audienceName}>
            {t("pdf.forCustomer", { name: doc.customer.firstName })}
          </Text>
          <Text style={styles.audienceDate}>
            {t("pdf.generatedOn", { date: formatDay(doc.locale, doc.generatedOn) })}
          </Text>
        </View>
      </View>
      <Text style={styles.title}>{doc.title ?? t("pdf.allTitle")}</Text>
      <View style={styles.rule} />
    </View>
  );
}

function PlanSection({ plan, spaced, doc, t }: Context & { plan: ExportPlan; spaced: boolean }) {
  const phase = phaseLine(plan.phase, doc.locale, t);
  return (
    // Heading, notes and week table stay on one page.
    <View style={spaced ? styles.sectionSpaced : undefined} wrap={false}>
      {/* A plan export is titled with the plan's name already. */}
      {doc.plans.length === 1 && plan.name === doc.title ? null : (
        <Text style={styles.sectionTitle}>{plan.name}</Text>
      )}
      {phase ? <Text style={styles.meta}>{phase}</Text> : null}
      {plan.notes ? <Text style={styles.notes}>{plan.notes}</Text> : null}
      <Text style={[styles.caption, styles.weekTitle]}>{t("pdf.week")}</Text>
      <View wrap={false}>
        {plan.week.map((day, index) => (
          <View
            key={day.weekday}
            style={index === 0 ? [styles.weekRow, styles.weekRowFirst] : styles.weekRow}
          >
            <Text style={styles.weekDay}>{weekdayName(doc.locale, day.weekday as Weekday)}</Text>
            <View style={styles.weekEntries}>
              {day.entries.length === 0 ? (
                <Text style={styles.rest}>{t("pdf.restDay")}</Text>
              ) : (
                day.entries.map((entry, entryIndex) => (
                  <Text key={entryIndex}>
                    {entry.label ? `${entry.label} · ${entry.routineName}` : entry.routineName}
                  </Text>
                ))
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function TrackHeader({ doc, t }: Context) {
  return (
    <View style={styles.trackHeader}>
      <Text style={styles.trackHint}>{t("pdf.track")}</Text>
      <View style={styles.boxes}>
        {WEEKDAYS.map((weekday) => (
          <View key={weekday} style={styles.boxColumn}>
            <Text style={styles.initial}>{weekdayName(doc.locale, weekday, "narrow")}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TrackBoxes({ routine }: { routine: ExportRoutine }) {
  const days = new Set<number>(routine.weekdays.length > 0 ? routine.weekdays : WEEKDAYS);
  return (
    <View style={styles.boxes}>
      {WEEKDAYS.map((weekday) => (
        <View key={weekday} style={styles.boxColumn}>
          {days.has(weekday) ? <View style={styles.box} /> : null}
        </View>
      ))}
    </View>
  );
}

function ItemRow({
  item,
  routine,
  doc,
  t,
  thumbnails,
}: Context & { item: ExportItem; routine: ExportRoutine }) {
  const thumbnail = item.videoId ? thumbnails.get(item.videoId) : undefined;
  return (
    <View style={styles.item}>
      {thumbnail ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt.
        <Image src={thumbnail} style={styles.thumb} />
      ) : (
        <View style={styles.thumbPlaceholder} />
      )}
      <View style={styles.body}>
        <Text style={styles.name}>
          {item.label ? <Text style={styles.itemLabel}>{`${item.label}  `}</Text> : null}
          {item.name}
        </Text>
        {item.summary ? <Text style={styles.summary}>{item.summary}</Text> : null}
        {item.notes ? (
          <Text style={styles.itemNotes}>
            <Text style={styles.notesLabel}>{`${t("pdf.notes")}: `}</Text>
            {item.notes}
          </Text>
        ) : null}
        {item.instructions ? (
          <Text style={styles.instructions}>
            {truncateText(item.instructions, INSTRUCTIONS_MAX)}
          </Text>
        ) : null}
      </View>
      {doc.tracking ? <TrackBoxes routine={routine} /> : null}
    </View>
  );
}

/** One exercise; superset members carry the group's left rule, the first one its caption too. */
type Row = { item: ExportItem; caption: string | null; inGroup: boolean };

function rows(routine: ExportRoutine, t: ExportTranslate): Row[] {
  return routine.blocks.flatMap((block: ExportBlock): Row[] => {
    if (block.kind === "single") return [{ item: block.item, caption: null, inGroup: false }];
    const caption =
      block.restSeconds !== null
        ? t("pdf.supersetRest", { seconds: block.restSeconds })
        : t("pdf.superset");
    return block.items.map((item, index) => ({
      item,
      caption: index === 0 ? caption : null,
      inGroup: true,
    }));
  });
}

/** Never split across pages. Consecutive members' left rules touch, so a superset reads as one. */
function RowView({ row, ...props }: Context & { row: Row; routine: ExportRoutine }) {
  const style = row.inGroup ? (row.caption ? [styles.group, styles.groupFirst] : styles.group) : {};
  return (
    <View style={style} wrap={false}>
      {row.caption ? (
        <Text style={[styles.caption, styles.groupCaption]}>{row.caption}</Text>
      ) : null}
      <ItemRow item={row.item} {...props} />
    </View>
  );
}

function RoutineSection({
  routine,
  spaced,
  ...context
}: Context & { routine: ExportRoutine; spaced: boolean }) {
  const { doc, t } = context;
  const phase = phaseLine(routine.phase, doc.locale, t);
  const sessions = frequencyLine(routine, t);
  const [firstRow, ...otherRows] = rows(routine, t);
  return (
    <View style={spaced ? styles.sectionSpaced : undefined}>
      {/* The heading never sits alone at the bottom of a page: it moves with the first exercise. */}
      <View wrap={false}>
        {/* A routine export is titled with the routine's name already. */}
        {doc.plans.length === 0 &&
        doc.routines.length === 1 &&
        routine.name === doc.title ? null : (
          <Text style={styles.sectionTitle}>{routine.name}</Text>
        )}
        {phase ? <Text style={styles.meta}>{phase}</Text> : null}
        {sessions ? <Text style={styles.meta}>{sessions}</Text> : null}
        {routine.notes ? <Text style={styles.notes}>{routine.notes}</Text> : null}
        {doc.tracking && firstRow ? <TrackHeader {...context} /> : null}
        {firstRow ? (
          <View style={styles.items}>
            <RowView row={firstRow} routine={routine} {...context} />
          </View>
        ) : null}
      </View>
      {otherRows.map((row) => (
        <RowView key={row.item.id} row={row} routine={routine} {...context} />
      ))}
    </View>
  );
}

function Footer({ doc, t }: Pick<Context, "doc" | "t">) {
  const qr = doc.shareUrl ? qrCode(doc.shareUrl) : null;
  return (
    <View style={styles.footer} fixed>
      <View style={styles.share}>
        {doc.shareUrl && qr ? (
          <>
            <Svg style={styles.qr} viewBox={`0 0 ${qr.size} ${qr.size}`}>
              <Path d={qr.path} fill="#000" />
            </Svg>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.scan}>{t("pdf.scan")}</Text>
              <Text style={styles.url}>{doc.shareUrl.replace(/^https?:\/\//, "")}</Text>
            </View>
          </>
        ) : null}
      </View>
      <Text
        style={styles.pageNumber}
        fixed
        render={({ pageNumber, totalPages }) =>
          t("pdf.page", { page: pageNumber, total: totalPages })
        }
      />
    </View>
  );
}

export type ExportPdfProps = {
  doc: ExportDocument;
  t: ExportTranslate;
  thumbnails: Map<string, string>;
  logo: string | null;
};

/** The branded A4 export (spec 14): header, plan week tables, routines, QR footer. */
export function ExportPdf({ doc, t, thumbnails, logo }: ExportPdfProps) {
  const context: Context = { doc, t, thumbnails };
  const hasPlans = doc.plans.length > 0;
  return (
    <Document
      title={doc.title ?? t("pdf.allTitle")}
      author={doc.branding.clinicName}
      language={doc.locale}
    >
      <Page size="A4" style={styles.page}>
        {/* Fixed chrome goes first: react-pdf only repeats it on pages laid out after it. */}
        <Footer doc={doc} t={t} />
        <Header {...context} logo={logo} />
        {doc.isEmpty ? (
          <Text style={styles.nothing}>{t("pdf.nothing")}</Text>
        ) : (
          <>
            {doc.plans.map((plan, index) => (
              <PlanSection key={plan.id} plan={plan} spaced={index > 0} {...context} />
            ))}
            {doc.routines.map((routine, index) => (
              <RoutineSection
                key={routine.id}
                routine={routine}
                spaced={index > 0 || hasPlans}
                {...context}
              />
            ))}
          </>
        )}
      </Page>
    </Document>
  );
}
