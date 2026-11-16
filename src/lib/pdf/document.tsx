/**
 * Proposal / invoice PDF with the Adsvio Mango & Ink identity.
 * Rendered server-side with @react-pdf/renderer (no browser needed).
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { DocSnapshot, DocLine } from "@/db/schema";
import { fmtMoney } from "@/lib/money/format";
import { fmtDate } from "@/lib/dates";
import { installmentAmounts, isIncluded, lineStandard, lineSubtotal } from "@/lib/business/doc-math";

const FONT_DIR = path.join(process.cwd(), "src", "lib", "pdf", "fonts");
const LOGO_PATH = path.join(process.cwd(), "public", "brand", "logo-adsvio.png");

let registered = false;
function ensureFonts() {
  if (registered) return;
  const load = (f: string) => {
    const file = path.join(FONT_DIR, f);
    return fs.existsSync(file) ? `data:font/ttf;base64,${fs.readFileSync(file).toString("base64")}` : null;
  };
  const inter = [
    { src: load("Inter-Regular.ttf"), fontWeight: 400 as const },
    { src: load("Inter-SemiBold.ttf"), fontWeight: 600 as const },
    { src: load("Inter-Bold.ttf"), fontWeight: 700 as const },
  ].filter((f) => f.src) as { src: string; fontWeight: 400 | 600 | 700 }[];
  const bric = [
    { src: load("Bricolage-Bold.ttf"), fontWeight: 700 as const },
    { src: load("Bricolage-ExtraBold.ttf"), fontWeight: 800 as const },
  ].filter((f) => f.src) as { src: string; fontWeight: 700 | 800 }[];
  if (inter.length) Font.register({ family: "Inter", fonts: inter });
  if (bric.length) Font.register({ family: "Bricolage", fonts: bric });
  Font.registerHyphenationCallback((w) => [w]);
  registered = true;
}

const C = { paper: "#FCFAF6", ink: "#16130F", soft: "#5C554C", rule: "#E2DAD0", mango: "#E8590C", mangoDeep: "#C4470A", wash: "#F3EEE6" };

const s = StyleSheet.create({
  page: { backgroundColor: C.paper, color: C.ink, fontFamily: "Inter", fontSize: 10, paddingTop: 44, paddingBottom: 56, paddingHorizontal: 48 },
  topRule: { position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: C.mango },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.rule },
  logo: { width: 118, height: 27 },
  docType: { fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.ink, textAlign: "right" },
  docMeta: { fontSize: 9, color: C.soft, textAlign: "right", marginTop: 3 },
  h1: { fontFamily: "Bricolage", fontSize: 24, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 },
  eyebrow: { fontSize: 9, fontWeight: 700, color: C.mangoDeep, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  prepared: { fontSize: 9.5, color: C.soft, marginBottom: 8 },
  intro: { fontSize: 10, color: C.ink, lineHeight: 1.5, marginBottom: 12 },
  tableHead: { flexDirection: "row", backgroundColor: C.wash, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 3 },
  th: { fontSize: 8, fontWeight: 700, color: C.soft, textTransform: "uppercase", letterSpacing: 0.6 },
  row: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.rule },
  rowTitle: { fontSize: 10.5, fontWeight: 700 },
  rowDesc: { fontSize: 9, color: C.soft, marginTop: 2, lineHeight: 1.4 },
  num: { textAlign: "right", fontSize: 10.5 },
  numMuted: { textAlign: "right", fontSize: 9.5, color: C.soft },
  totalsWrap: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, gap: 24 },
  sched: { flex: 1 },
  schedTitle: { fontSize: 10, fontWeight: 600, marginBottom: 6 },
  schedRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4, fontSize: 9.5 },
  totals: { width: 230 },
  tRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4, fontSize: 9.5, color: C.soft },
  tBig: { backgroundColor: C.ink, color: C.paper, padding: 10, marginTop: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 3 },
  tBigLabel: { fontSize: 8, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" },
  tBigValue: { fontFamily: "Bricolage", fontSize: 20, fontWeight: 800 },
  section: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.rule },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
  small: { fontSize: 8.5, color: C.soft, lineHeight: 1.45 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: C.soft },
  approval: { marginTop: 22, flexDirection: "row", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1, borderTopColor: C.rule },
  signLine: { width: 220, borderBottomWidth: 1, borderBottomColor: C.ink, paddingBottom: 2, fontSize: 9 },
});

function money(minor: number, currency: string) {
  // Keep the brand's compact "$949" style for USD and RD$ for pesos.
  return fmtMoney(minor, currency);
}

function LineRow({ line, currency, showStandard, numbered, idx }: { line: DocLine; currency: string; showStandard: boolean; numbered: boolean; idx: number }) {
  return (
    <View style={s.row} wrap={false}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={s.rowTitle}>
          {numbered ? `${String(idx + 1).padStart(2, "0")}  ` : ""}
          {line.title}
          {line.quantity !== 1 ? `  ×${line.quantity}` : ""}
        </Text>
        {line.description ? <Text style={s.rowDesc}>{line.description}</Text> : null}
      </View>
      {showStandard ? <Text style={[s.numMuted, { width: 70 }]}>{line.standardRateMinor ? money(lineStandard(line), currency) : ""}</Text> : null}
      <Text style={[s.num, { width: 80, fontWeight: showStandard ? 700 : 400 }]}>{money(lineSubtotal(line), currency)}</Text>
    </View>
  );
}

export function DocumentPdf({ snap, logoSrc }: { snap: DocSnapshot; logoSrc: string | null }) {
  const cur = snap.currency;
  const services = snap.lines.filter((l) => l.kind === "service");
  const maintenance = snap.lines.filter((l) => l.kind === "maintenance");
  const third = snap.lines.filter((l) => l.kind === "third_party");
  const showStandard = services.some((l) => l.standardRateMinor && l.standardRateMinor !== l.rateMinor);
  const t = snap.totals;
  const schedule = snap.docType === "proposal" ? installmentAmounts(t.totalMinor, snap.installments ?? []) : [];
  const isProposal = snap.docType === "proposal";
  const numbered = services.length > 3;
  return (
    <Document title={`${snap.number} · ${snap.title}`} author="Adsvio Agency" producer="Personal Assistant System">
      <Page size="LETTER" style={s.page}>
        <View style={s.topRule} fixed />
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
          {logoSrc ? <Image src={logoSrc} style={s.logo} /> : <Text style={{ fontFamily: "Bricolage", fontSize: 22, fontWeight: 800 }}>Adsvio.</Text>}
          <View>
            <Text style={s.docType}>{isProposal ? "Project proposal" : "Invoice"}</Text>
            <Text style={s.docMeta}>
              {fmtDate(snap.issueDate, "long")} | {snap.number}
            </Text>
            {!isProposal && snap.dueDate ? <Text style={s.docMeta}>Due {fmtDate(snap.dueDate, "long")}</Text> : null}
            {isProposal && snap.validUntil ? <Text style={s.docMeta}>Valid until {fmtDate(snap.validUntil, "long")}</Text> : null}
          </View>
        </View>

        <Text style={s.h1}>{snap.client.company}</Text>
        {snap.subtitle ? <Text style={s.eyebrow}>{snap.subtitle}</Text> : <Text style={s.eyebrow}>{snap.title}</Text>}
        <Text style={s.prepared}>
          {isProposal ? "Prepared for" : "Billed to"} {snap.client.contactName ? `${snap.client.contactName} / ${snap.client.company}` : snap.client.company}
          {snap.client.billingAddress ? ` · ${snap.client.billingAddress.replace(/\n/g, ", ")}` : ""} / By Adsvio Agency
          {snap.project ? ` · Project: ${snap.project.name}` : ""}
        </Text>
        {snap.intro ? <Text style={s.intro}>{snap.intro}</Text> : null}

        <View style={s.tableHead} fixed={false}>
          <Text style={[s.th, { flex: 1 }]}>{isProposal ? "Project scope" : "Description"}</Text>
          {showStandard ? <Text style={[s.th, { width: 70, textAlign: "right" }]}>Standard</Text> : null}
          <Text style={[s.th, { width: 80, textAlign: "right" }]}>{showStandard ? "Agreed" : `Value (${cur})`}</Text>
        </View>
        {services.map((l, i) => (
          <LineRow key={l.id} line={l} currency={cur} showStandard={showStandard} numbered={numbered} idx={i} />
        ))}

        <View style={s.totalsWrap} wrap={false}>
          <View style={s.sched}>
            {isProposal && schedule.length > 0 ? (
              <>
                <Text style={s.schedTitle}>Payment schedule</Text>
                {schedule.map((a) => (
                  <View key={a.installment.id} style={s.schedRow}>
                    <Text style={{ color: C.soft }}>
                      {a.installment.label}
                      {a.installment.dueLabel ? ` (${a.installment.dueLabel})` : a.installment.dueDate ? ` (${fmtDate(a.installment.dueDate)})` : ""}
                    </Text>
                    <Text style={{ fontWeight: 700 }}>{money(a.amountMinor, cur)}</Text>
                  </View>
                ))}
                {snap.paymentInstructions ? <Text style={[s.small, { marginTop: 4 }]}>{snap.paymentInstructions}</Text> : null}
              </>
            ) : !isProposal ? (
              <>
                <Text style={s.schedTitle}>Payment</Text>
                {snap.paymentTerms ? <Text style={s.small}>{snap.paymentTerms}</Text> : null}
                {snap.paymentInstructions ? <Text style={[s.small, { marginTop: 4 }]}>{snap.paymentInstructions}</Text> : null}
              </>
            ) : null}
          </View>
          <View style={s.totals}>
            {showStandard || t.lineDiscountsMinor > 0 || t.projectDiscountMinor > 0 ? (
              <>
                <View style={s.tRow}>
                  <Text>Standard project price</Text>
                  <Text>{money(showStandard ? t.standardSubtotalMinor : t.servicesSubtotalMinor + t.lineDiscountsMinor, cur)}</Text>
                </View>
                {t.standardSubtotalMinor - t.servicesSubtotalMinor + t.projectDiscountMinor > 0 ? (
                  <View style={s.tRow}>
                    <Text>Courtesy discount</Text>
                    <Text style={{ color: C.mangoDeep }}>-{money((showStandard ? t.standardSubtotalMinor - t.servicesSubtotalMinor : t.lineDiscountsMinor) + t.projectDiscountMinor, cur)}</Text>
                  </View>
                ) : null}
              </>
            ) : null}
            {t.maintenanceMinor > 0 ? (
              <View style={s.tRow}>
                <Text>Maintenance (selected)</Text>
                <Text>{money(t.maintenanceMinor, cur)}</Text>
              </View>
            ) : null}
            {snap.taxes.map((tx) => (
              <View key={tx.label} style={s.tRow}>
                <Text>
                  {tx.label} ({(tx.rateBasisPoints / 100).toFixed(2)}%)
                </Text>
                <Text>{money(Math.round((t.servicesTotalMinor * tx.rateBasisPoints) / 10000), cur)}</Text>
              </View>
            ))}
            <View style={s.tBig}>
              <Text style={s.tBigLabel}>{isProposal ? "Your project total" : "Amount due"}</Text>
              <Text style={s.tBigValue}>{money(t.totalMinor, cur)}</Text>
            </View>
          </View>
        </View>

        {maintenance.length > 0 ? (
          <View style={s.section} wrap={false}>
            {maintenance.map((m) => (
              <View key={m.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={s.sectionTitle}>
                    {m.selected ? "" : "Optional "}
                    {m.title}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: 700 }}>
                    {money(lineSubtotal(m), cur)}
                    {m.period ? ` / ${m.period}` : ""}
                  </Text>
                </View>
                {m.description ? <Text style={s.small}>{m.description}</Text> : null}
                {!m.selected ? <Text style={[s.small, { marginTop: 2 }]}>Not included in the total above; starts only if selected.</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {third.length > 0 ? (
          <View style={s.section} wrap={false}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={s.sectionTitle}>Third-party costs</Text>
              <Text style={{ fontSize: 9, color: C.soft }}>Paid directly to providers</Text>
            </View>
            {third.map((l) => (
              <View key={l.id} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                <Text style={{ fontSize: 9.5 }}>{l.title}</Text>
                <Text style={{ fontSize: 9.5, fontWeight: 600 }}>
                  ≈ {money(lineSubtotal(l), cur)}
                  {l.period ? ` / ${l.period}` : ""}
                </Text>
              </View>
            ))}
            <Text style={[s.small, { marginTop: 3 }]}>Estimates, settled separately with each provider and confirmed at purchase or renewal. Not part of the Adsvio amount due.</Text>
          </View>
        ) : null}

        {isProposal && (snap.timingNotes || snap.exclusions || snap.revisionLimit || snap.paymentTerms) ? (
          <View style={s.section}>
            {snap.timingNotes ? <Text style={s.small}>Timing & scope: {snap.timingNotes}</Text> : null}
            {snap.revisionLimit ? <Text style={[s.small, { marginTop: 3 }]}>Revisions: {snap.revisionLimit}</Text> : null}
            {snap.exclusions ? <Text style={[s.small, { marginTop: 3 }]}>Not included: {snap.exclusions}</Text> : null}
            {snap.paymentTerms ? <Text style={[s.small, { marginTop: 3 }]}>Terms: {snap.paymentTerms}</Text> : null}
          </View>
        ) : null}

        {isProposal ? (
          <View style={s.approval} wrap={false}>
            <Text style={s.signLine}>Approved by: </Text>
            <Text style={[s.signLine, { width: 160 }]}>Date: </Text>
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text>All amounts in {cur === "USD" ? "US dollars (USD)" : cur === "DOP" ? "Dominican pesos (DOP)" : cur}.</Text>
          <Text render={({ pageNumber, totalPages }) => `ADSVIO AGENCY / ${String(pageNumber).padStart(2, "0")}${totalPages > 1 ? ` of ${String(totalPages).padStart(2, "0")}` : ""}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderDocumentPdf(snap: DocSnapshot): Promise<Buffer> {
  ensureFonts();
  const logoSrc = fs.existsSync(LOGO_PATH) ? `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString("base64")}` : null;
  const buf = await renderToBuffer(<DocumentPdf snap={snap} logoSrc={logoSrc} />);
  return Buffer.from(buf);
}

export { isIncluded };
