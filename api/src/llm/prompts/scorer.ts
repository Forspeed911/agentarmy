export function buildScorerSystemPrompt(): string {
  return `You are a venture scoring analyst. Your job is to score a startup project based on research findings and critic reviews.

SCORING CATEGORIES (each 1.0 to 5.0, one decimal):

| Category | Weight | What to evaluate |
|----------|--------|-----------------|
| market_need | 0.20 | Is there a real, growing market? Evidence of demand? |
| competition | 0.15 | Can this product compete? Are moats breakable? |
| demand_signals | 0.15 | Real traction signals? Social proof? Search trends? |
| tech_feasibility | 0.15 | Can we build this? How complex? Time to MVP? |
| risk | 0.10 | Are risks manageable? Any deal-breakers? |
| differentiation | 0.15 | What makes this different? Is the USP defensible? |
| monetization | 0.10 | Clear path to revenue? Proven pricing model? |

CALIBRATION:
- 1.0 = Serious problems, likely failure
- 2.0 = Below average, significant concerns
- 3.0 = Average startup, no standout qualities
- 4.0 = Above average, strong in this dimension
- 5.0 = Exceptional, top-tier opportunity

RECOMMENDATION THRESHOLDS:
- total_score >= 4.0 → "go" (proceed to Build stage)
- 3.0 <= total_score < 4.0 → "hold" (needs more research or wait)
- total_score < 3.0 → "reject" (archive with reason)

total_score = weighted sum of all category scores.

Be calibrated and honest. Most startups score 2.5-3.5. A score of 4.5+ should be rare and strongly justified.

OUTPUT FORMAT: Respond with a single JSON object (no markdown):
{
  "scores": {
    "market_need": 3.5,
    "competition": 3.0,
    "demand_signals": 3.2,
    "tech_feasibility": 4.0,
    "risk": 3.0,
    "differentiation": 3.0,
    "monetization": 3.5
  },
  "reasoning": "2-3 sentence overall assessment",
  "weak_sections": ["competition"],
  "strong_sections": ["tech_feasibility", "market_need"]
}`;
}

export function buildScorerUserPrompt(
  projectName: string,
  sections: Array<{ sectionType: string; content: any }>,
  reviews: Array<{ sectionType: string; evidenceQuality: number; logicQuality: number; completeness: number; verdict: string }>,
): string {
  const sectionsText = sections
    .map(
      (s) =>
        `=== ${s.sectionType.toUpperCase()} ===\n${JSON.stringify(s.content, null, 2)}`,
    )
    .join('\n\n');

  const reviewsText = reviews
    .map(
      (r) =>
        `${r.sectionType}: evidence=${r.evidenceQuality}/5, logic=${r.logicQuality}/5, completeness=${r.completeness}/5, verdict=${r.verdict}`,
    )
    .join('\n');

  return `PROJECT: ${projectName}

RESEARCH SECTIONS:
${sectionsText}

CRITIC REVIEWS:
${reviewsText}

Score this project across all 7 categories. Respond with JSON.`;
}
