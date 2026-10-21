import { describe, expect, it } from "vitest";
import { csvCell, csvResponse, toCsv } from "@/lib/csv";

describe("CSV export", () => {
  it("neutralises spreadsheet formulas", () => {
    for (const value of ["=SUM(A1)", "+cmd", "-2+3", "@user", "\t=1"]) {
      expect(csvCell(value).startsWith("'")).toBe(true);
    }
    expect(csvCell("\r=1")).toBe("\"'\r=1\"");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("Rao, Asha")).toBe('"Rao, Asha"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
  });

  it("writes a header and one row per registration", () => {
    const csv = toCsv(["Name", "Note"], [["Asha", "=1"], ["Bilal", "ok"]]);
    expect(csv).toBe("Name,Note\r\nAsha,'=1\r\nBilal,ok\r\n");
  });

  it("returns an attachment with a safe filename", () => {
    const res = csvResponse("contest 12/registrations", "a,b\r\n");
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="contest-12-registrations.csv"');
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
