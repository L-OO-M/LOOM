import { describe, it, expect } from "vitest";
import {
  parseSkills, inr, priceFor, matchesQuery, matchesExpertise, matchesExperience,
  availabilityBucket, sortMentors, addMinutes, slotsForDate, validateBooking,
} from "@/lib/mentors";

describe("mentor service", () => {
  it("parseSkills merges + dedupes comma lists", () => {
    expect(parseSkills("React, Node.js", "react, AWS")).toEqual(["React", "Node.js", "AWS"]);
    expect(parseSkills("", null)).toEqual([]);
  });

  it("prices sessions from hourly rate", () => {
    expect(priceFor(800, 60)).toBe(800);
    expect(priceFor(800, 30)).toBe(400);
    expect(priceFor(null, 30)).toBeNull();
    expect(inr(800)).toBe("₹800");
    expect(inr(null)).toBeNull();
  });

  it("search matches name/skills/bio, all words", () => {
    const m = { mentor_name: "Alex Morgan", skills: "React, Node.js", bio: "backend dev" };
    expect(matchesQuery(m, "alex react")).toBe(true);
    expect(matchesQuery(m, "python")).toBe(false);
    expect(matchesQuery(m, "")).toBe(true);
  });

  it("expertise + experience filters", () => {
    expect(matchesExpertise({ skills: "Machine Learning" }, "Machine Learning")).toBe(true);
    expect(matchesExpertise({ skills: "React" }, "DevOps")).toBe(false);
    expect(matchesExpertise({ skills: "React" }, "all")).toBe(true);
    expect(matchesExperience({ experience_years: 7 }, "5-10")).toBe(true);
    expect(matchesExperience({ experience_years: 2 }, "5-10")).toBe(false);
    expect(matchesExperience({ experience_years: null }, "5-10")).toBe(false);
    expect(matchesExperience({ experience_years: null }, "any")).toBe(true);
  });

  it("availabilityBucket reads the weekly schedule", () => {
    const monday = new Date("2026-09-07T12:00:00"); // a Monday
    expect(availabilityBucket([], monday)).toBe("none");
    expect(availabilityBucket([{ day_of_week: 1, start_time: "10:00", end_time: "12:00" }], monday)).toBe("today");
    expect(availabilityBucket([{ day_of_week: 3, start_time: "10:00", end_time: "12:00" }], monday)).toBe("week");
  });

  it("sortMentors orders without mutating", () => {
    const list = [
      { id: 1, experience_years: 2, avg_rating: 4.9 },
      { id: 2, experience_years: 9, avg_rating: 4.5 },
    ];
    expect(sortMentors(list, "experienced")[0].id).toBe(2);
    expect(sortMentors(list, "rated")[0].id).toBe(1);
    expect(list[0].id).toBe(1);
  });

  it("slotsForDate slices ranges and marks booked", () => {
    const slots = slotsForDate([{ start_time: "10:00", end_time: "11:00" }], ["10:30"], 30);
    expect(slots.map((s) => s.time)).toEqual(["10:00", "10:30"]);
    expect(slots[1].available).toBe(false);
    expect(addMinutes("10:30", 30)).toBe("11:00");
  });

  it("validateBooking rejects bad input", () => {
    const mentor = { available: true };
    expect(validateBooking({ mentor, dateIso: "2099-01-01", time: "10:00", duration: 30, bookedTimes: [] }).ok).toBe(true);
    expect(validateBooking({ mentor: null, dateIso: "2099-01-01", time: "10:00", duration: 30 }).ok).toBe(false);
    expect(validateBooking({ mentor: { available: false }, dateIso: "2099-01-01", time: "10:00", duration: 30 }).ok).toBe(false);
    expect(validateBooking({ mentor, dateIso: "2000-01-01", time: "10:00", duration: 30 }).ok).toBe(false);
    expect(validateBooking({ mentor, dateIso: "2099-01-01", time: "10:00", duration: 30, bookedTimes: ["10:00"] }).ok).toBe(false);
  });
});
