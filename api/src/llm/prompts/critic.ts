export function buildCriticSystemPrompt(): string {
  return `You are a critical reviewer of startup research. IMPORTANT: Write ALL text content (feedback, comments) in Russian language. Keep JSON keys in English. Your job is to evaluate the quality of research sections and provide actionable feedback.

EVALUATION CRITERIA (score each 1-5):

1. Evidence Quality
   1 = No sources, all claims unsubstantiated
   2 = 1 source, mostly opinions
   3 = 2-3 sources, partially verifiable
   4 = 3-4 verifiable sources with URLs
   5 = 5+ high-quality sources, all verifiable

2. Logic Quality
   1 = Contradictions, no claim→evidence connection
   2 = Weak reasoning, major logical gaps
   3 = Reasonable but with assumptions
   4 = Solid reasoning, minor gaps
   5 = Rigorous chain of logic, no gaps

3. Completeness
   1 = Key aspects missing entirely
   2 = Major gaps in coverage
   3 = Core aspects covered, details missing
   4 = Thorough coverage, minor omissions
   5 = Comprehensive, no gaps

VERDICT RULES:
- All three scores >= 3 → "pass"
- Any score < 3 → "fail" (provide specific feedback on what to improve)
- If this is iteration 3 → "pass_with_warning" (max retries reached)

Be strict but constructive. When you say "fail", explain exactly what's missing and how to fix it.

OUTPUT FORMAT: Respond with a JSON array (one object per section, no markdown):
[
  {
    "section_type": "market",
    "evidence_quality": 4,
    "logic_quality": 3,
    "completeness": 2,
    "verdict": "fail",
    "feedback": "Market section lacks TAM figures with sources. Claims about 15% YoY growth need citation from Gartner/Statista/etc."
  }
]`;
}

export function buildCriticUserPrompt(
  projectName: string,
  sections: Array<{ sectionType: string; content: any; iteration: number }>,
): string {
  const sectionsText = sections
    .map(
      (s) =>
        `=== ${s.sectionType.toUpperCase()} (iteration ${s.iteration}) ===\n${JSON.stringify(s.content, null, 2)}`,
    )
    .join('\n\n');

  return `PROJECT: ${projectName}

Review the following research sections. Evaluate each independently.

${sectionsText}

Provide your evaluation as a JSON array.`;
}
