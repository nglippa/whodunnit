import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/style";
import { analyzeWriting, type PatternPermission } from "../rules/engine";
import { getRegistry, rulesForProfile } from "../rules/packs";
import { classifyDocumentStructure, structurePermission } from "./structure";

describe("conservative document structure", () => {
  it.each([
    ["INTERVIEW", "Interviewer: What broke? Speaker: The hinge.\n\nInterviewer: When? Speaker: Tuesday.\n\nInterviewer: Who fixed it? Speaker: Mara."],
    ["FAQ", "Q: When does the gate open?\nA: At nine.\nQ: Is there a fee?\nA: No."],
    ["PROCEDURE", "1. Open the panel.\n2. Check the wire.\n3. Close the panel."],
    ["EMAIL", "From: Mara\nTo: Lee\nSubject: gate\n\nThe hinge is fixed."],
    ["LIST", "- Gate checked\n- Hinge replaced\n- Lock tested\n- Key returned"],
    ["CHAT", "Nina 9:14: Gate open?\nEli 9:15: Yes.\nNina 9:16: Thanks.\nEli 9:17: See you."],
    ["MIXED", "From: Jo\nTo: Lee\nSubject: handoff\n\nPlease check:\n- Gate\n- Lock\n\nThanks"],
    ["NOTES", "Team meeting\nAttending\nJo and Lee\nDecisions\n- Keep the gate open\n- Move the table\nActions\n- Jo: call Lee"],
  ] as const)("recognizes %s from repeated structural evidence", (type, text) => {
    const structure = classifyDocumentStructure(text);
    expect(structure.type).toBe(type);
    expect(structure.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("does not classify one incidental label or a short sentence confidently", () => {
    expect(classifyDocumentStructure("Question: What happened? I answered in the letter.").type).toBe("UNKNOWN");
    expect(classifyDocumentStructure("The hinge broke Tuesday.").confidence).toBeLessThan(0.8);
  });

  it("recognizes unmarked operational form without using topic words", () => {
    expect(classifyDocumentStructure("Check the seal before opening.\nRecord the serial number.\nIf the label is torn, call the supervisor.\nAttach the record to the case.", { enhanced: true })).toMatchObject({ type: "PROCEDURE", confidence: 0.84 });
    expect(classifyDocumentStructure("This rule applies to all evening access requests.\n\nA requester must provide a contact number.\n\nStaff shall record the decision before closing the case.", { enhanced: true })).toMatchObject({ type: "POLICY", confidence: 0.82 });
    expect(classifyDocumentStructure("Tuesday desk review\nDecision: defer the sign change\nOpen: check the measurements\nOwner: Mira\nDue: Friday", { enhanced: true })).toMatchObject({ type: "NOTES", confidence: 0.83 });
    expect(classifyDocumentStructure("Tuesday desk review\nDecision: defer the sign change\nOpen: check the measurements\nOwner: Mira\nDue: Friday").type).toBe("TRANSCRIPT");
    expect(classifyDocumentStructure("We must decide soon. We must check the facts. We must tell the team.").type).toBe("UNKNOWN");
  });

  it("recognizes repeated paragraph and speaker structure without literal Q/A or Step labels", () => {
    const faq = ["When can we collect it?", "Collect it on Tuesday at noon.", "Who may sign?", "The named requester may sign.", "What if the door is locked?", "Call the desk before leaving."].join("\n\n");
    expect(classifyDocumentStructure(faq, { enhanced: true }).type).toBe("FAQ");
    const transcript = ["09:02 Mira: The case is sealed.", "09:03 Jo: I have the receipt.", "09:04 Mira: Please read the number.", "09:05 Jo: It is 418."].join("\n\n");
    const chat = transcript.replaceAll("\n\n", "\n");
    expect(classifyDocumentStructure(transcript, { enhanced: true }).type).toBe("TRANSCRIPT");
    expect(classifyDocumentStructure(chat, { enhanced: true }).type).toBe("CHAT");
    expect(classifyDocumentStructure(transcript).type).not.toBe("TRANSCRIPT");
    const unmarked = ["Put the case on the tray. Check the label.", "Record the serial number before moving it.", "Rinse the cup and place it on the rack.", "Close the lid. Deliver the record to the desk."].join("\n\n");
    expect(classifyDocumentStructure(unmarked, { enhanced: true }).type).toBe("PROCEDURE");
  });

  it("does not infer procedure or FAQ from one question or incidental imperatives", () => {
    const prose = "When did the system fail? We found the answer in the log.\n\nThe team checked the numbers. They sent the report.\n\nThe result changed our plan.";
    expect(classifyDocumentStructure(prose, { enhanced: true }).type).toBe("PROSE");
    const formal = "The committee must review the record before voting.\n\nWe must also consider the cost of delay.\n\nThe evidence is incomplete unless the final measurement arrives.";
    expect(classifyDocumentStructure(formal, { enhanced: true }).type).not.toBe("POLICY");
    const academic = "We must inspect the sample before claiming a trend.\n\nWe must account for the smaller evening group.\n\nWe must resist generalising the result unless another site confirms it.";
    expect(classifyDocumentStructure(academic, { enhanced: true }).type).not.toBe("POLICY");
  });

  it("licenses only relevant rules when genre evidence is strong", () => {
    const interview = classifyDocumentStructure("Interviewer: When? Speaker: Tuesday.\n\nInterviewer: Why? Speaker: Rain.\n\nInterviewer: Again? Speaker: No.");
    expect(structurePermission(interview, "core.repeated-paragraph-openers")).toMatchObject({ reason: expect.stringMatching(/interview structure/), scope: "speaker-prefix" });
    expect(structurePermission(interview, "slop.empty-phrases")).toBeNull();
    expect(structurePermission(classifyDocumentStructure("A question was asked."), "slop.self-answered-questions")).toBeNull();
  });

  it("does not count structural list markers as prose dash habits", () => {
    const list = "From: Jo\nTo: Lee\nSubject: notes\n\n- Check the gate\n- Check the lock\n- Check the sign\n\nWe spoke—briefly.";
    const structure = classifyDocumentStructure(list);
    expect(structure.type).toBe("MIXED");
    expect(structurePermission(structure, "slop.dash-density", list)).toMatchObject({ reason: expect.stringMatching(/list markers/), scope: "list-dash-dominance" });
    expect(structurePermission(structure, "slop.dash-density", `${list} We spoke—again—and left.`)).toBeNull();
  });

  it("keeps ambiguous long Q/A and numbered arguments from gaining genre permissions", () => {
    const qa = [1, 2, 3].map((n) => `Question: Why was item ${n} delayed?\nAnswer: The item stayed in the storeroom while the committee compared the old plan with the revised plan and checked the measurements with staff before the next meeting, so the answer needs this paragraph of context rather than a short exchange.`).join("\n\n");
    expect(classifyDocumentStructure(qa)).toMatchObject({ type: "UNKNOWN", confidence: 0.5 });
    const argument = "1. The current permit rule excludes evening deliveries.\n2. The council should consider the people who work after six.\n3. The proposed change would let those residents use the same loading area.";
    expect(classifyDocumentStructure(argument).type).not.toBe("PROCEDURE");
    expect(structurePermission(classifyDocumentStructure(argument), "core.repeated-sentence-openers")).toBeNull();
  });

  it("does not suppress unrelated prose matches inside a chat or after the format changes", () => {
    const chat = "Nina 9:14: Is the gate open?\nEli 9:15: Yes.\nNina 9:16: Is the lock checked?\nEli 9:17: Yes.\nNina 9:18: Is the sign up?\nEli 9:19: Yes.";
    const prose = "Nina checked the gate. Nina checked the lock. Nina checked the sign. Nina checked the lights.";
    const permission: PatternPermission = { ruleId: "core.repeated-sentence-openers", layer: "source-voice", reason: "speaker labels", scope: "speaker-prefix", documentType: "CHAT" };
    const rules = rulesForProfile(PRESETS.natural, getRegistry());
    const mixed = analyzeWriting(`${chat}\n\n${prose}`, rules, { permissions: [permission] });
    const finding = mixed.findings.find((f) => f.rule.id === permission.ruleId);
    expect(finding?.matches.length).toBeGreaterThan(6);
    expect(finding?.suppressedBy).toBeUndefined();
    const later = analyzeWriting(prose, rules, { permissions: [permission] });
    expect(later.findings.find((f) => f.rule.id === permission.ruleId)?.suppressedBy).toBeUndefined();
  });
});
