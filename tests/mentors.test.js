import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MENTOR_ROLES } from "@/lib/mentorship";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const sql = () => read("load/migrations/102_mentors_for_leaders.sql");

describe("leaders mentor by default", () => {
  it("keeps the JS role list identical to the trigger's", () => {
    const match = sql().match(/IF NEW\.role IN \(([^)]*)\)/);
    expect(match).toBeTruthy();
    const inSql = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(inSql).toEqual([...MENTOR_ROLES].sort());
  });

  it("enforces the rule at the database, not in one API route", () => {
    // Seats are granted from role requests, handover, admin status changes and
    // scoped grants. A rule in one of those is a rule the others bypass.
    const text = sql();
    expect(text).toContain("CREATE TRIGGER profiles_ensure_mentor");
    expect(text).toMatch(/AFTER INSERT OR UPDATE OF role/);
    expect(text).toContain("ON public.profiles");
  });

  it("backfills without overwriting an edited mentor row", () => {
    const backfill = sql().slice(sql().indexOf("INSERT INTO public.mentors"));
    expect(backfill).toContain("ON CONFLICT (user_id) DO NOTHING");
    expect(backfill).not.toMatch(/DO UPDATE/);
  });

  it("never removes a mentor on demotion", () => {
    // Sessions and reviews belong to the person, not the seat.
    expect(sql()).not.toMatch(/DELETE FROM public\.mentors/);
  });
});

describe("a mentor's area is the seat, not the self-chosen domain", () => {
  const labelSql = () => read("load/migrations/103_mentor_position_label.sql");

  it("builds the label from assigned memberships", () => {
    const text = labelSql();
    expect(text).toContain("department_memberships");
    expect(text).toMatch(/' · Head'/);
    expect(text).toMatch(/' · Core'/);
    expect(text).toContain("term_end IS NULL OR m.term_end >= CURRENT_DATE");
  });

  it("does not seed expertise from the domain a member picked", () => {
    const text = labelSql();
    const insert = text.slice(
      text.indexOf("INSERT INTO public.mentors"),
      text.indexOf("ON CONFLICT (user_id) DO NOTHING")
    );
    expect(insert).toContain("mentor_position_label");
    expect(insert).not.toContain("primary_domain");
  });

  it("leaves an admin's edited expertise alone", () => {
    expect(labelSql()).toMatch(/m\.expertise IS NOT DISTINCT FROM COALESCE/);
  });

  it("falls back to the role when no department seat is held", () => {
    const text = labelSql();
    for (const fallback of ["Vertical Lead", "Chapter Admin", "Department Head", "Core member"]) {
      expect(text).toContain(fallback);
    }
  });
});
