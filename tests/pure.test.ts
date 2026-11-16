import { describe, it, expect } from "vitest";
import { occurrencesBetween, dayInMonth, relativeDay } from "@/lib/dates";
import { computeTotals, installmentAmounts } from "@/lib/business/doc-math";
import { parseMoney, fmtMoney } from "@/lib/money/format";
import { parseCsv, parseDateLoose } from "@/lib/csv";

describe("recurrence", () => {
  it("uses the month's last valid day for missing days and marks it visibly", () => {
    expect(dayInMonth("2026-02", 31)).toEqual({ date: "2026-02-28", clamped: true });
    expect(dayInMonth("2028-02", 30)).toEqual({ date: "2028-02-29", clamped: true });
    const semi = occurrencesBetween({ frequency: "semimonthly", anchorDate: "2026-01-01", daysOfMonth: [15, 31] }, "2026-02-01", "2026-04-30");
    expect(semi.map((o) => o.date)).toEqual(["2026-02-15", "2026-02-28", "2026-03-15", "2026-03-31", "2026-04-15", "2026-04-30"]);
    expect(semi[1].clamped).toBe(true);
    const bi = occurrencesBetween({ frequency: "biweekly", anchorDate: "2026-01-02" }, "2026-01-01", "2026-02-15");
    expect(bi.map((o) => o.date)).toEqual(["2026-01-02", "2026-01-16", "2026-01-30", "2026-02-13"]);
  });
  it("wording", () => {
    expect(relativeDay("2026-11-16", "2026-11-16")).toBe("today");
    expect(relativeDay("2026-11-13", "2026-11-16")).toBe("3 days overdue");
  });
});

describe("document math", () => {
  it("totals include services and selected maintenance, exclude third-party costs, apply discounts and taxes", () => {
    const t = computeTotals(
      [
        { id: "a", kind: "service", title: "Design", quantity: 1, rateMinor: 550_00, standardRateMinor: 600_00, sort: 0 },
        { id: "b", kind: "service", title: "Copy", quantity: 2, rateMinor: 150_00, discountMinor: 50_00, sort: 1 },
        { id: "c", kind: "maintenance", title: "Care", quantity: 1, rateMinor: 59_00, optional: true, selected: false, sort: 2 },
        { id: "d", kind: "maintenance", title: "Care+", quantity: 1, rateMinor: 100_00, optional: true, selected: true, sort: 3 },
        { id: "e", kind: "third_party", title: "Domain", quantity: 1, rateMinor: 15_00, sort: 4 },
      ],
      100_00,
      [{ label: "ITBIS", rateBasisPoints: 1800 }],
    );
    expect(t.servicesSubtotalMinor).toBe(550_00 + 250_00 + 100_00);
    expect(t.standardSubtotalMinor).toBe(600_00 + 300_00 + 100_00);
    expect(t.projectDiscountMinor).toBe(100_00);
    expect(t.servicesTotalMinor).toBe(800_00);
    expect(t.taxMinor).toBe(144_00);
    expect(t.totalMinor).toBe(944_00);
    expect(t.thirdPartyMinor).toBe(15_00);
    expect(t.maintenanceMinor).toBe(100_00);
    expect(t.includedLineIds).toEqual(["a", "b", "d"]);
  });
  it("percent installments add up exactly", () => {
    const amounts = installmentAmounts(949_00, [
      { id: "1", label: "A", kind: "deposit", mode: "percent", value: 50 },
      { id: "2", label: "B", kind: "final", mode: "percent", value: 50 },
    ]);
    expect(amounts.map((a) => a.amountMinor)).toEqual([474_50, 474_50]);
    const thirds = installmentAmounts(1_000_00, [
      { id: "1", label: "A", kind: "deposit", mode: "percent", value: 33.33 },
      { id: "2", label: "B", kind: "milestone", mode: "percent", value: 33.33 },
      { id: "3", label: "C", kind: "final", mode: "percent", value: 33.34 },
    ]);
    expect(thirds.reduce((s, a) => s + a.amountMinor, 0)).toBe(1_000_00);
  });
});

describe("money parsing and CSV", () => {
  it("parses local formats", () => {
    expect(parseMoney("1,200.50")).toBe(120050);
    expect(parseMoney("1.200,50")).toBe(120050);
    expect(parseMoney("RD$ 3,800")).toBe(380000);
    expect(fmtMoney(120050, "DOP")).toBe("RD$1,200.50");
    expect(fmtMoney(-5000, "USD")).toBe("-US$50.00");
  });
  it("parses quoted CSV and loose dates", () => {
    const rows = parseCsv('Date,Merchant,Amount,Category\n2026-11-02,"Super, Nacional",1200.00,Groceries\n11/03/2026,Uber,350,Transport\n');
    expect(rows).toHaveLength(3);
    expect(rows[1][1]).toBe("Super, Nacional");
    expect(parseDateLoose("11/03/2026")).toBe("2026-11-03");
    expect(parseDateLoose("03/11/2026", true)).toBe("2026-11-03");
    expect(parseDateLoose("2026-1-5")).toBe("2026-01-05");
  });
});
