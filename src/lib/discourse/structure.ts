/** Document form is evidence about why repetition occurs, not a quality verdict. */
export type DocumentType = "PROSE" | "EMAIL" | "CHAT" | "TRANSCRIPT" | "INTERVIEW" | "FAQ" | "PROCEDURE" | "POLICY" | "LIST" | "NOTES" | "MIXED" | "UNKNOWN";

export interface DocumentStructure {
  type: DocumentType;
  confidence: number;
  /** Counts and structural cues only; no source text enters observability. */
  evidence: string[];
}

const count = (lines: string[], re: RegExp) => lines.filter((line) => re.test(line)).length;

export function classifyDocumentStructure(text: string): DocumentStructure {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const paragraphCount = text.split(/\n\s*\n/).filter((part) => part.trim()).length;
  const bullet = count(lines, /^(?:[-*+]\s|\d+[.)]\s)/);
  const numbered = count(lines, /^\d+[.)]\s/);
  const imperativeSteps = count(lines, /^\d+[.)]\s+(?:open|close|check|put|take|add|remove|record|write|send|call|press|turn|place|move|leave|return|use|confirm|inspect|clean|fill|save|select|enter|attach|collect|measure|wait|read|mark|sign|notify|report|stop|start|keep)\b/i);
  const qa = count(lines, /^(?:Q(?:uestion)?|A(?:nswer)?):\s/i);
  const questionAnswerParagraphs = text.split(/\n\s*\n/).filter((part) => {
    const ls = part.trim().split(/\n/).map((line) => line.trim());
    return ls.length >= 2 && /\?$/.test(ls[0]) && ls.slice(1).some((line) => line.length > 8 && !/\?$/.test(line));
  }).length;
  const speakerLines = lines.filter((line) => /^(?:[A-Z][a-z]+(?: [A-Z][a-z]+)?|[A-Z]):\s/.test(line));
  const roles = new Set(speakerLines.map((line) => line.split(":", 1)[0].toLowerCase()));
  const interviewer = (text.match(/\bInterviewer:\s/g) ?? []).length;
  const answerer = (text.match(/\b(?:Speaker|Respondent|Participant):\s/g) ?? []).length;
  const timestamps = count(lines, /^(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)/);
  const chatLines = count(lines, /^[\p{Lu}][\p{L}]{1,24}\s+\d{1,2}:\d{2}:\s/u);
  const mailHeaders = count(lines, /^(?:From|To|Subject|Cc|Date):\s/i);
  const mailTurns = count(lines, /^From:\s/i);
  const greeting = /^(?:Dear\s+\S+|Hi\s+\S+|Hello\s+\S+)[,:]/im.test(text);
  const signoff = /(?:^|\n)\s*(?:Best|Regards|Sincerely|Thanks)[,\s]*\n/i.test(text);
  const policySections = count(lines, /^(?:section\s+\d+|\d+(?:\.\d+)+\s|policy:\s|scope:\s)/i);
  const headingLines = count(lines, /^#{1,6}\s|^[A-Z][A-Za-z /-]{3,40}:$/);
  const notesHeadings = count(lines, /^(?:Decisions|Actions|Action items|Still open|Attending|Present|Minutes)$/i);
  const evidence: string[] = [];
  const result = (type: DocumentType, confidence: number, note: string): DocumentStructure => ({ type, confidence, evidence: [...evidence, note] });

  if (mailTurns >= 2 && mailHeaders >= 4) return result("MIXED", 0.9, `${mailTurns} messages in an email thread`);
  if (mailHeaders >= 1 && bullet >= 2) return result("MIXED", 0.86, "mail content and structured list");
  if (mailHeaders >= 2) return result("EMAIL", 0.96, `${mailHeaders} mail headers`);
  if (interviewer >= 2 && (answerer >= 2 || (speakerLines.length >= 4 && roles.size >= 2))) return result("INTERVIEW", 0.98, `${interviewer} interviewer and ${Math.max(answerer, speakerLines.length - interviewer)} respondent turns`);
  if (count(lines, /^Question:\s/i) >= 3 && count(lines, /^Answer:\s.{120,}/i) >= 3) return result("UNKNOWN", 0.5, "extended Q/A could be an interview or an FAQ");
  if (qa >= 4 && qa % 2 === 0) return result("FAQ", 0.94, `${qa} question/answer lines`);
  if (questionAnswerParagraphs >= 3) return result("FAQ", 0.88, `${questionAnswerParagraphs} question-led answer paragraphs`);
  if (chatLines >= 4) return result("CHAT", 0.92, `${chatLines} named timestamped messages`);
  if (speakerLines.length >= 4 && roles.size >= 2) {
    if (timestamps >= 2) return result("TRANSCRIPT", 0.95, `${speakerLines.length} speaker turns with timestamps`);
    return result("TRANSCRIPT", 0.88, `${speakerLines.length} speaker turns across ${roles.size} roles`);
  }
  if (timestamps >= 3 && speakerLines.length >= 2) return result("CHAT", 0.9, `${timestamps} timestamped lines`);
  if (greeting && signoff) return result("EMAIL", 0.84, "greeting and signoff");
  if (numbered >= 3 && numbered >= lines.length * 0.35 && imperativeSteps >= Math.ceil(numbered * 0.6)) return result("PROCEDURE", 0.9, `${numbered} numbered action steps`);
  if (numbered >= 3 && numbered >= lines.length * 0.35 && imperativeSteps < Math.ceil(numbered * 0.6)) return result("UNKNOWN", 0.45, "numbered material without decisive procedure evidence");
  if (policySections >= 2) return result("POLICY", 0.86, `${policySections} policy sections`);
  if (bullet >= 2 && (headingLines >= 1 || notesHeadings >= 2 || /^(?:Present|Attendees|Action items):/im.test(text)) && lines.length >= 5) return result("NOTES", 0.84, `${bullet} bullets with meeting-note markers`);
  if (bullet >= 3 && bullet >= lines.length * 0.5) return result("LIST", 0.9, `${bullet} list items`);
  if (paragraphCount >= 2 && lines.length >= 2) return result("PROSE", 0.7, `${paragraphCount} prose paragraphs without strong structural markers`);
  if (text.trim().length > 0 && lines.length === 1) return result("UNKNOWN", 0.3, "too little structural evidence");
  return result("UNKNOWN", 0.4, "no decisive structural markers");
}

/** Only high-confidence structure excuses these form-dependent local rules. */
const CONTEXT_PERMISSIONS: Partial<Record<DocumentType, readonly string[]>> = {
  INTERVIEW: ["core.repeated-paragraph-openers", "slop.self-answered-questions", "core.repeated-sentence-openers"],
  TRANSCRIPT: ["core.repeated-paragraph-openers", "slop.self-answered-questions", "core.repeated-sentence-openers", "slop.dramatic-fragments"],
  FAQ: ["slop.self-answered-questions", "core.repeated-paragraph-openers", "core.repeated-sentence-openers"],
  PROCEDURE: ["core.repeated-paragraph-openers", "core.repeated-sentence-openers"],
  LIST: ["core.repeated-paragraph-openers", "core.repeated-sentence-openers"],
  NOTES: ["core.repeated-paragraph-openers"],
  CHAT: ["core.repeated-sentence-openers", "core.repeated-paragraph-openers"],
};

export type StructuralScope = "list-dash-dominance" | "speaker-prefix" | "dialogue-question" | "faq-question" | "structural-paragraph-opener" | "mail-header" | "transcript-marker";
export interface StructuralPermission { reason: string; scope: StructuralScope; documentType: DocumentType }

export function structurePermission(structure: DocumentStructure, ruleId: string, text = ""): StructuralPermission | null {
  if (structure.confidence < 0.8) return null;
  if (ruleId === "slop.dash-density" && ["LIST", "NOTES", "MIXED", "PROCEDURE"].includes(structure.type)) {
    const bullets = (text.match(/^\s*[-*+]\s/gm) ?? []).length;
    const proseDashes = (text.match(/—|–/g) ?? []).length;
    if (bullets >= 2 && bullets >= proseDashes * 2) return { reason: "list markers account for most dashes; prose dash use alone is insufficient evidence", scope: "list-dash-dominance", documentType: structure.type };
  }
  if (!CONTEXT_PERMISSIONS[structure.type]?.includes(ruleId)) return null;
  const scope: StructuralScope = ruleId === "slop.dramatic-fragments" ? "transcript-marker"
    : ruleId === "slop.self-answered-questions" && ["INTERVIEW", "TRANSCRIPT"].includes(structure.type) ? "dialogue-question"
    : ruleId === "slop.self-answered-questions" || structure.type === "FAQ" ? "faq-question"
    : ["INTERVIEW", "TRANSCRIPT", "CHAT"].includes(structure.type) ? "speaker-prefix" : "structural-paragraph-opener";
  return { reason: `${structure.type.toLowerCase()} structure explains this repetition (${structure.evidence.join("; ")})`, scope, documentType: structure.type };
}
