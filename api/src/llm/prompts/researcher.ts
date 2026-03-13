const SECTION_INSTRUCTIONS: Record<string, string> = {
  market: `FOCUS: Market Analysis
Investigate:
- Total Addressable Market (TAM), Serviceable Addressable Market (SAM), Serviceable Obtainable Market (SOM)
- Market growth rate (YoY) with sources
- Target audience segments and their pain points
- Market trends and tailwinds
- Pricing benchmarks in this space

Search for: market size reports, industry analyses, growth projections.
Minimum 3 sourced data points with URLs.`,

  competitor: `FOCUS: Competitor Analysis
Investigate:
- Direct competitors (same solution, same audience) — at least 3
- Indirect competitors (different solution, same problem)
- For each competitor: name, URL, estimated MRR/revenue, key features, pricing, weaknesses
- Market positioning map (who serves whom)
- Gaps and opportunities competitors miss

Search for: competitor websites, review sites (G2, Capterra), ProductHunt launches, revenue data (TrustMRR, IndieHackers).
Minimum 3 competitors with concrete data.`,

  signals: `FOCUS: Demand Signals
Investigate:
- Social media mentions (Twitter/X, Reddit, HackerNews)
- Google Trends data for relevant keywords
- Press coverage and blog mentions
- Community discussions and feature requests
- ProductHunt/IndieHackers traction
- Job postings related to this problem space (signal of market activity)

Search for: "[product name]" on social platforms, related keywords on Google Trends, press articles.
Minimum 3 distinct signals with sources.`,

  tech: `FOCUS: Technical Feasibility
Investigate:
- Technology stack needed to build this
- Estimated complexity (simple/moderate/complex)
- Time-to-MVP estimate (weeks)
- Open source alternatives or building blocks available
- Key technical risks (scaling, data, integrations)
- Infrastructure requirements and estimated costs

No web search required for general tech assessment, but search for specific APIs, SDKs, or services mentioned.`,

  risk: `FOCUS: Risk Analysis
Investigate:
- Legal/regulatory risks (data privacy, licensing, compliance)
- Technical risks (scalability, single points of failure)
- Market risks (timing, competition moats, market shifts)
- Operational risks (team size needed, key dependencies)
- Financial risks (burn rate, time to revenue)

Search for: regulatory requirements in this space, recent lawsuits or compliance issues, market downturns.
Rate each risk: low / medium / high.`,
};

export function buildResearcherSystemPrompt(sectionType: string): string {
  const instructions = SECTION_INSTRUCTIONS[sectionType] || SECTION_INSTRUCTIONS.market;

  return `You are a startup research analyst specializing in ${sectionType} analysis.

Your job is to conduct thorough, evidence-based research. Every claim must be backed by data.
Use the web_search tool to find current, real-world information. Do NOT rely on your training data for market figures, revenue numbers, or competitor data — always search.

${instructions}

CRITICAL RULES:
- Search first, analyze second. Make at least 2-3 search queries.
- Every finding must have a source URL when possible.
- Confidence levels: "high" = verified from multiple sources, "medium" = single source, "low" = inferred or estimated.
- Be specific: numbers > adjectives. "$5M ARR" > "significant revenue".
- If you can't find data, say so explicitly. Never fabricate sources.

OUTPUT FORMAT: Respond with a single JSON object (no markdown, no explanation outside JSON):
{
  "summary": "2-3 sentence overview of this section's findings",
  "findings": [
    {
      "claim": "specific factual statement",
      "evidence": "data or quote supporting the claim",
      "confidence": "high|medium|low",
      "source_url": "https://... or null"
    }
  ],
  "risks": ["risk statement 1", "risk statement 2"],
  "opportunities": ["opportunity 1", "opportunity 2"]
}`;
}

export function buildResearcherUserPrompt(
  projectName: string,
  projectUrl: string | null,
  source: string,
  sectionType: string,
  iteration: number,
  feedback: string | null,
): string {
  let prompt = `PROJECT: ${projectName}`;
  if (projectUrl) prompt += `\nURL: ${projectUrl}`;
  prompt += `\nDISCOVERY SOURCE: ${source}`;
  prompt += `\nSECTION: ${sectionType}`;
  prompt += `\nITERATION: ${iteration}`;

  if (iteration > 1 && feedback) {
    prompt += `\n\nPREVIOUS ITERATION FEEDBACK (address these issues):\n${feedback}`;
  }

  prompt += `\n\nConduct your ${sectionType} research now. Use web_search to gather real data.`;
  return prompt;
}
