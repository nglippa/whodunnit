import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import { verifyObjectiveAware } from "./objective-aware-verification";

const check = (source: string, candidate: string, objective: string) =>
  verifyObjectiveAware(source, candidate, objective, PRESETS.natural);

describe("v11 objective-aware deterministic boundary", () => {
  it("permits an exact requested weekday change and rejects the same candidate without that request", () => {
    const source = "The meeting is scheduled for Tuesday.";
    const candidate = "The meeting is scheduled for Wednesday.";
    expect(check(source, candidate, "Make this more concise.").verification.status).toBe("rejected");
    const allowed = check(source, candidate, "Update this to say the meeting is now Wednesday.");
    expect(allowed.verification.status).not.toBe("rejected");
    expect(allowed.authorized.some((item) => item.candidate?.toLowerCase() === "wednesday")).toBe(true);
  });

  it("does not authorize unrelated time or actor changes beside a licensed weekday change", () => {
    const result = check("The review is Tuesday at 2 PM with Alex.", "The review is Wednesday at 4 PM with Jordan.", "Move the review to Wednesday.");
    expect(result.verification.status).toBe("rejected");
    expect(result.verification.findings.some((item) => item.severity === "blocking" && item.kind === "altered_number")).toBe(true);
  });

  it("does not treat a date mentioned for a different subject as authorization", () => {
    const source = "The meeting is Tuesday. Alex will send the report.";
    const candidate = "The meeting is Wednesday. Alex will send the report.";
    const objective = "Update this to remind Alex that Wednesday is the report deadline.";
    const result = check(source, candidate, objective);
    expect(result.verification.status).toBe("rejected");
    expect(result.authorized).toHaveLength(0);
  });

  it("requires an explicit owner update before allowing an actor substitution", () => {
    const source = "Alex Morgan owns the next review.";
    const candidate = "Jordan Lee owns the next review.";
    expect(check(source, candidate, "Make this shorter.").verification.status).toBe("rejected");
    const authorized = check(source, candidate, "Update the owner to Jordan Lee.");
    expect(authorized.verification.status).not.toBe("rejected");
    expect(authorized.authorized.some((item) => item.kind === "altered_name")).toBe(true);
  });

  it("rejects ambiguous permission and keeps a meaningful contrary-to-report qualifier", () => {
    expect(check("The meeting is Tuesday.", "The meeting is Wednesday.", "Make the schedule clearer.").verification.status).toBe("rejected");
    const qualified = check("Contrary to the initial report, the bridge is open.", "The bridge is open.", "Tighten the wording.");
    expect(qualified.authorized).toHaveLength(0);
    expect(qualified.verification.status).toBe("review");
  });

  it("allows empty framing to go while retaining the proposition", () => {
    const source = "It is important to note that the team completed the migration on Tuesday.";
    const candidate = "The team completed the migration on Tuesday.";
    expect(check(source, candidate, "Remove empty framing.").verification.status).not.toBe("rejected");
  });

  it("treats sequential checklist markers as layout, while retaining quantities inside steps", () => {
    const source = "Check the connection, wait 5 minutes, then restart the service.";
    const good = "1. Check the connection.\n2. Wait 5 minutes.\n3. Restart the service.";
    const bad = "1. Check the connection.\n2. Wait 10 minutes.\n3. Restart the service.";
    expect(check(source, good, "Make this a numbered checklist.").verification.findings.some((item) => item.severity === "blocking" && item.kind === "altered_number")).toBe(false);
    expect(check(source, bad, "Make this a numbered checklist.").verification.findings.some((item) => item.severity === "blocking" && item.kind === "altered_number")).toBe(true);
  });
});
