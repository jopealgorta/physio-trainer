import {
  Document,
  Image,
  Link,
  Page,
  Path,
  Polygon,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";

import { CALENDAR_DATE_FORMAT, calendarDateToDate } from "@/lib/calendar-date";
import { normalizeHex, printAccent } from "@/lib/color";
import { type Weekday, weekdayName } from "@/lib/plans";
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

/**
 * Greyscale-safe palette: the PDF is often printed in black and white. The clinic accent (made
 * readable as small text on paper) is used sparingly: the title rule, section headings, the
 * superset bar and video links.
 */
const FOREGROUND = "#171717";
const SECONDARY = "#525252";
const MUTED = "#737373";
const RULE = "#d4d4d4";
const LIGHT_RULE = "#e5e5e5";
const CALLOUT = "#f5f5f5";

const MARGIN = 40;
const GUTTER = 24;
const VIDEO_COLUMN = 84;
/** The superset bar sits in the page margin, so members line up with single exercises. */
const GROUP_BAR = 2;
const GROUP_INSET = 8;
/** Above this many characters an exercise may break across pages instead of moving whole. */
const LONG_INSTRUCTIONS = 1200;

const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT,
    fontSize: 10,
    color: FOREGROUND,
    paddingTop: MARGIN,
    paddingHorizontal: MARGIN,
    paddingBottom: 100,
    // No lineHeight here: react-pdf 4.9 then lays the fixed footer out at the top of a page that
    // starts with a break and drops its border and page number. Set it per text style instead.
  },
  runningTitle: {
    position: "absolute",
    top: 20,
    left: MARGIN,
    width: 340,
    fontSize: 8,
    color: MUTED,
  },
  runningCustomer: {
    position: "absolute",
    top: 20,
    right: MARGIN,
    width: 150,
    fontSize: 8,
    color: MUTED,
    textAlign: "right",
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { flexDirection: "row", alignItems: "center", flexShrink: 1, marginRight: 16 },
  logo: { height: 40, maxWidth: 120, objectFit: "contain", marginRight: 12 },
  clinicName: { fontSize: 12, fontWeight: 700 },
  contact: { fontSize: 8.5, color: SECONDARY, marginTop: 2 },
  contactLink: { color: SECONDARY, textDecoration: "none" },
  audience: { alignItems: "flex-end", flexShrink: 0 },
  audienceName: { fontSize: 10, fontWeight: 700 },
  audienceDate: { fontSize: 8.5, color: SECONDARY, marginTop: 2 },
  title: { fontSize: 20, fontWeight: 700, marginTop: 22, lineHeight: 1.2 },
  // The title rule: a hairline with a short accent bar sitting on it.
  rule: { height: 2, marginTop: 10, marginBottom: 20 },
  ruleLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0.75,
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
  },
  ruleAccent: { position: "absolute", left: 0, top: 0, width: 40, height: 2 },
  nothing: { fontSize: 11, color: SECONDARY },
  sectionTitle: { fontSize: 14, fontWeight: 700, lineHeight: 1.2 },
  meta: { fontSize: 9, color: SECONDARY, marginTop: 3 },
  notes: { fontSize: 9.5, marginTop: 6, lineHeight: 1.35 },
  callout: {
    fontSize: 9.5,
    lineHeight: 1.4,
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: CALLOUT,
    borderLeftWidth: 2,
  },
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
  // No italic face is bundled (Outfit regular/bold only), so the note is set apart by colour.
  dayNote: { color: SECONDARY, marginTop: 2 },
  items: { marginTop: 6 },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 9,
    borderBottomWidth: 0.5,
    borderBottomColor: LIGHT_RULE,
  },
  number: {
    width: GUTTER,
    fontSize: 10.5,
    fontWeight: 700,
    color: MUTED,
    lineHeight: 1.2,
  },
  body: { flex: 1 },
  name: { fontSize: 10.5, fontWeight: 700, lineHeight: 1.2 },
  summary: { fontSize: 9.5, marginTop: 2, lineHeight: 1.3 },
  itemNotes: { fontSize: 9, color: SECONDARY, marginTop: 3, lineHeight: 1.3 },
  notesLabel: { fontWeight: 700 },
  instructions: { fontSize: 9, color: SECONDARY, marginTop: 4, lineHeight: 1.4 },
  videoColumn: { width: VIDEO_COLUMN, alignItems: "flex-end", paddingTop: 1.5 },
  video: { flexDirection: "row", alignItems: "center", textDecoration: "none" },
  play: { width: 5.5, height: 6.5, marginRight: 4 },
  videoLabel: { fontSize: 8.5, fontWeight: 700 },
  group: {
    borderLeftWidth: GROUP_BAR,
    paddingLeft: GROUP_INSET,
    marginLeft: -(GROUP_BAR + GROUP_INSET),
  },
  groupFirst: { marginTop: 10 },
  groupCaption: { paddingTop: 4 },
  sectionSpaced: { marginTop: 30 },
  // A routine section's name: a step under the routine title, distinct from the superset caption.
  sectionHeading: {
    fontSize: 10.5,
    fontWeight: 700,
    lineHeight: 1.2,
    marginTop: 16,
    marginBottom: 2,
  },
  footer: {
    position: "absolute",
    left: MARGIN,
    right: MARGIN,
    bottom: 26,
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
  url: { fontSize: 8, color: SECONDARY, marginTop: 2, textDecoration: "none" },
  // A render-prop Text is measured before it has content: give it room up front.
  pageNumber: { fontSize: 8, color: SECONDARY, width: 120, textAlign: "right", flexShrink: 0 },
});

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
  /** The clinic accent, readable as small text on white; neutral without one. */
  accent: string;
};

function accentOf(doc: ExportDocument): string {
  const { accentColor } = doc.branding;
  return accentColor && normalizeHex(accentColor) ? printAccent(accentColor) : FOREGROUND;
}

function Header({ doc, t, accent, logo }: Context & { logo: string | null }) {
  const contact = doc.branding.contact;
  const parts = contact
    ? [
        contact.email ? (
          <Link key="email" src={`mailto:${contact.email}`} style={styles.contactLink}>
            {contact.email}
          </Link>
        ) : null,
        contact.phone ? <Text key="phone">{contact.phone}</Text> : null,
        contact.website ? (
          <Link key="website" src={contact.website} style={styles.contactLink}>
            {contact.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </Link>
        ) : null,
      ].filter((part) => part !== null)
    : [];
  return (
    <View>
      <View style={styles.header}>
        <View style={styles.brand}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt. */}
          {logo ? <Image src={logo} style={styles.logo} /> : null}
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.clinicName}>{doc.branding.clinicName}</Text>
            {parts.length > 0 ? (
              <Text style={styles.contact}>
                {parts.flatMap((part, index) => (index === 0 ? [part] : [" · ", part]))}
              </Text>
            ) : null}
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
      <View style={styles.rule}>
        <View style={styles.ruleLine} />
        <View style={[styles.ruleAccent, { backgroundColor: accent }]} />
      </View>
    </View>
  );
}

/** The document title and customer, at the top of every page after the first. */
function RunningHeader({ doc, t }: Pick<Context, "doc" | "t">) {
  const title = doc.title ?? t("pdf.allTitle");
  const customer = t("pdf.forCustomer", { name: doc.customer.firstName });
  return (
    <>
      <Text
        style={styles.runningTitle}
        fixed
        render={({ pageNumber }) => (pageNumber > 1 ? title : "")}
      />
      <Text
        style={styles.runningCustomer}
        fixed
        render={({ pageNumber }) => (pageNumber > 1 ? customer : "")}
      />
    </>
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
              {day.notes ? <Text style={styles.dayNote}>{day.notes}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function VideoLink({ url, t, accent }: Pick<Context, "t" | "accent"> & { url: string }) {
  return (
    <Link src={url} style={styles.video}>
      {/* A play triangle: Outfit has no ▶ glyph. */}
      <Svg style={styles.play} viewBox="0 0 11 13">
        <Polygon points="0,0 11,6.5 0,13" fill={accent} />
      </Svg>
      <Text style={[styles.videoLabel, { color: accent }]}>{t("pdf.watchVideo")}</Text>
    </Link>
  );
}

const isLong = (item: ExportItem) => (item.instructions?.length ?? 0) > LONG_INSTRUCTIONS;

function ItemRow({ item, number, t, accent }: Context & { item: ExportItem; number: string }) {
  return (
    <View style={styles.item} wrap={isLong(item)}>
      <Text style={styles.number}>{number}</Text>
      <View style={styles.body}>
        {/* A long exercise may break across pages, but never between its name and dose. */}
        <View wrap={false}>
          <Text style={styles.name}>{item.name}</Text>
          {item.summary ? <Text style={styles.summary}>{item.summary}</Text> : null}
          {item.notes ? (
            <Text style={styles.itemNotes}>
              <Text style={styles.notesLabel}>{`${t("pdf.notes")}: `}</Text>
              {item.notes}
            </Text>
          ) : null}
        </View>
        {item.instructions ? <Text style={styles.instructions}>{item.instructions}</Text> : null}
      </View>
      <View style={styles.videoColumn}>
        {item.videoUrl ? <VideoLink url={item.videoUrl} t={t} accent={accent} /> : null}
      </View>
    </View>
  );
}

/**
 * One exercise, numbered 1, 2, 3… through the routine or labelled A1, A2 inside a superset;
 * superset members carry the group's left rule, the first one its caption too.
 */
type ItemRowData = {
  kind: "item";
  item: ExportItem;
  number: string;
  caption: string | null;
  inGroup: boolean;
};
/** A section heading, shown only when the routine has two or more non-empty sections. */
type HeadingRow = { kind: "heading"; name: string };
type Row = ItemRowData | HeadingRow;

function rows(routine: ExportRoutine, t: ExportTranslate): Row[] {
  let singles = 0;
  return routine.sections.flatMap((section): Row[] => {
    const heading: Row[] = routine.sectionHeadings ? [{ kind: "heading", name: section.name }] : [];
    const items = section.blocks.flatMap((block: ExportBlock): ItemRowData[] => {
      if (block.kind === "single") {
        singles += 1;
        const number = String(singles);
        return [{ kind: "item", item: block.item, number, caption: null, inGroup: false }];
      }
      const caption =
        block.restSeconds !== null
          ? t("pdf.supersetRest", { seconds: block.restSeconds })
          : t("pdf.superset");
      return block.items.map((item, index) => ({
        kind: "item",
        item,
        number: item.label ?? "",
        caption: index === 0 ? caption : null,
        inGroup: true,
      }));
    });
    return [...heading, ...items];
  });
}

const rowKey = (row: Row, index: number) =>
  row.kind === "heading" ? `heading-${index}` : row.item.id;

/** Consecutive members' left rules touch, so a superset reads as one. */
function RowView({ row, ...context }: Context & { row: ItemRowData }) {
  const style = row.inGroup
    ? [styles.group, row.caption ? styles.groupFirst : {}, { borderLeftColor: context.accent }]
    : {};
  return (
    <View style={style} wrap={isLong(row.item)}>
      {row.caption ? (
        <Text style={[styles.caption, styles.groupCaption, { color: context.accent }]}>
          {row.caption}
        </Text>
      ) : null}
      <ItemRow item={row.item} number={row.number} {...context} />
    </View>
  );
}

/** Rows up to and including the next exercise, so a heading never sits alone at a page bottom. */
function leadingRows(all: Row[]): { lead: Row[]; rest: Row[] } {
  const firstItem = all.findIndex((row) => row.kind === "item");
  const end = firstItem === -1 ? all.length : firstItem + 1;
  return { lead: all.slice(0, end), rest: all.slice(end) };
}

function GroupedRows({ list, ...context }: Context & { list: Row[] }) {
  // Consecutive headings cannot occur (empty sections are dropped), so a heading is followed by
  // an exercise; they are rendered together in one unbreakable view.
  const out: React.ReactNode[] = [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (row.kind === "heading") {
      const next = list[i + 1];
      out.push(
        <View key={rowKey(row, i)} wrap={false}>
          <Text style={[styles.sectionHeading, { color: context.accent }]}>{row.name}</Text>
          {next && next.kind === "item" ? <RowView row={next} {...context} /> : null}
        </View>,
      );
      i++;
    } else {
      out.push(<RowView key={rowKey(row, i)} row={row} {...context} />);
    }
  }
  return <>{out}</>;
}

function RoutineSection({
  routine,
  spaced,
  ...context
}: Context & { routine: ExportRoutine; spaced: boolean }) {
  const { doc, t, accent } = context;
  const phase = phaseLine(routine.phase, doc.locale, t);
  const sessions = frequencyLine(routine, t);
  const { lead, rest } = leadingRows(rows(routine, t));
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
        {routine.notes ? (
          <Text style={[styles.callout, { borderLeftColor: accent }]}>{routine.notes}</Text>
        ) : null}
        {lead.length > 0 ? (
          <View style={styles.items}>
            <GroupedRows list={lead} {...context} />
          </View>
        ) : null}
      </View>
      <GroupedRows list={rest} {...context} />
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
              <Link src={doc.shareUrl} style={styles.url}>
                {doc.shareUrl.replace(/^https?:\/\//, "")}
              </Link>
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
  logo: string | null;
};

/** The branded A4 export (spec 14): header, plan week tables, routines, QR footer. */
export function ExportPdf({ doc, t, logo }: ExportPdfProps) {
  const context: Context = { doc, t, accent: accentOf(doc) };
  const hasPlans = doc.plans.length > 0;
  return (
    <Document
      title={doc.title ?? t("pdf.allTitle")}
      author={doc.branding.clinicName}
      language={doc.locale}
    >
      <Page size="A4" style={styles.page}>
        {/* Fixed chrome goes first: react-pdf only repeats it on pages laid out after it. */}
        <RunningHeader doc={doc} t={t} />
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
