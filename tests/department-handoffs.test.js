import { describe, expect, it } from "vitest";
import {
  DEPARTMENT_DELIVERABLE_SCHEMAS,
  decideHandoffTransition,
  SOCIETY_WORKSHOP_PIPELINE,
  validateDepartmentDeliverable,
  getNextHandoffStep
} from "@/lib/department-handoffs";

describe("department handoff workflows", () => {
  it("defines 7 distinct steps for society workshop workflow", () => {
    expect(SOCIETY_WORKSHOP_PIPELINE).toHaveLength(7);
    expect(SOCIETY_WORKSHOP_PIPELINE[0].owningDepartment).toBe("technical");
    expect(SOCIETY_WORKSHOP_PIPELINE[1].owningDepartment).toBe("documentation");
    expect(SOCIETY_WORKSHOP_PIPELINE[2].owningDepartment).toBe("design");
    expect(SOCIETY_WORKSHOP_PIPELINE[3].owningDepartment).toBe("smm_content");
    expect(SOCIETY_WORKSHOP_PIPELINE[4].owningDepartment).toBe("publicity");
    expect(SOCIETY_WORKSHOP_PIPELINE[5].owningDepartment).toBe("management");
    expect(SOCIETY_WORKSHOP_PIPELINE[6].owningDepartment).toBe("documentation");
  });

  it("enforces the handoff state machine", () => {
    expect(decideHandoffTransition("ready", "start")).toEqual({
      ok: true,
      nextStatus: "in_progress"
    });
    expect(decideHandoffTransition("in_progress", "submit")).toEqual({
      ok: true,
      nextStatus: "submitted"
    });
    expect(decideHandoffTransition("submitted", "approve")).toEqual({
      ok: true,
      nextStatus: "approved"
    });
    expect(decideHandoffTransition("pending", "start")).toEqual({
      ok: false,
      reason: "INVALID_TRANSITION"
    });
    expect(decideHandoffTransition("approved", "return").ok).toBe(false);
  });

  it("validates design department deliverables require figma/canva and preview", () => {
    const invalid = validateDepartmentDeliverable("design", { format: "png" });
    expect(invalid.valid).toBe(false);
    expect(invalid.missingFields).toContain("canvaOrFigmaUrl");
    expect(invalid.missingFields).toContain("assetPreviewUrl");

    const valid = validateDepartmentDeliverable("design", {
      canvaOrFigmaUrl: "https://figma.com/file/123",
      assetPreviewUrl: "https://storage.loom.dev/poster.png",
      format: "png"
    });
    expect(valid.valid).toBe(true);
    expect(valid.missingFields).toHaveLength(0);
  });

  it("validates web department deliverables require repository and deployed url", () => {
    const invalid = validateDepartmentDeliverable("web", { repositoryUrl: "https://github.com/loom/site" });
    expect(invalid.valid).toBe(false);
    expect(invalid.missingFields).toContain("deployedUrl");

    const valid = validateDepartmentDeliverable("web", {
      repositoryUrl: "https://github.com/loom/site",
      deployedUrl: "https://loom.dev"
    });
    expect(valid.valid).toBe(true);
  });

  it("advances sequentially through handoff pipeline", () => {
    const step2 = getNextHandoffStep("technical_proposal");
    expect(step2.id).toBe("documentation_brief");

    const step3 = getNextHandoffStep("documentation_brief");
    expect(step3.id).toBe("design_creatives");

    const terminal = getNextHandoffStep("documentation_post_event");
    expect(terminal).toBeNull();
  });
});
