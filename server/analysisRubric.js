// contract review rules, versioned

export const RUBRIC_VERSION = 'v1.2';

// severity for missing clauses
export const RUBRIC_RULES = [
  {
    id: 'L1',
    category: 'legal',
    title: 'Compensation terms',
    severityIfMissing: 'high',
    guidance:
      'The contract must state a specific dollar amount, the payment method, and when payments happen. Vague phrases such as "to be discussed" are a finding.'
  },
  {
    id: 'L2',
    category: 'legal',
    title: 'Term and termination',
    severityIfMissing: 'high',
    guidance:
      'The contract must define when it starts and ends, any renewal, and how either side can terminate early.'
  },
  {
    id: 'L3',
    category: 'legal',
    title: 'Identifiable parties',
    severityIfMissing: 'high',
    guidance:
      'The athlete and the payer/brand must be identified with real names or a legal entity. Placeholder names are a finding.'
  },
  {
    id: 'L4',
    category: 'legal',
    title: 'Scope of NIL rights',
    severityIfMissing: 'medium',
    guidance:
      'The contract must state what name, image and likeness rights are licensed (channels, media, territory, duration) and what the athlete keeps.'
  },
  {
    id: 'F1',
    category: 'fairness',
    title: 'One-sided indemnification',
    guidance:
      'Flag if the athlete indemnifies the brand for broad claims, especially including the brand own negligence, while the brand does not indemnify back. Mutual indemnity is fine.'
  },
  {
    id: 'F2',
    category: 'fairness',
    title: 'Non-compete on future deals',
    guidance:
      'Flag clauses that block the athlete from signing other NIL deals, or give the brand right of first refusal over future opportunities.'
  },
  {
    id: 'F3',
    category: 'fairness',
    title: 'Unclear content ownership',
    guidance:
      'Flag if the contract does not say who owns created content (photos, videos, posts), or if the brand keeps content rights forever with no limits.'
  },
  {
    id: 'F4',
    category: 'fairness',
    title: 'Asymmetric confidentiality',
    guidance:
      'Flag if only the athlete is bound to confidentiality, or if the athlete cannot tell family, agents, or the athletic department about the deal.'
  },
  {
    id: 'N1',
    category: 'ncaa_institutional',
    title: 'Large payment disclosure',
    guidance:
      'If total compensation appears to exceed 600 dollars, note that a tax form (W-9 / 1099) is expected. Report as informational, not a contract defect.'
  },
  {
    id: 'N2',
    category: 'ncaa_institutional',
    title: 'Agency representation disguised as endorsement',
    guidance:
      'Flag if the contract reads like agency representation (recruiting the athlete, negotiating other deals, long exclusivity) instead of a single endorsement deal.'
  },
  {
    id: 'N3',
    category: 'ncaa_institutional',
    title: 'Conflict with school or NCAA rules',
    guidance:
      'Flag pay-for-play terms (payment tied to playing, performance, or staying enrolled), unapproved use of school trademarks or logos, and anything that looks like a recruiting inducement.'
  }
];

// NIL Go readiness checklist
export const COMPLETENESS_FIELDS = [
  { id: 'payer', label: 'Payer identified' },
  { id: 'compensation', label: 'Compensation identified' },
  { id: 'dates', label: 'Contract dates identified' },
  { id: 'nilActivity', label: 'NIL activity identified' },
  { id: 'businessPurpose', label: 'Business purpose documented' }
];

export function buildSystemPrompt() {
  return [
    'You are an assistant for university compliance officers who review NIL (name, image and likeness) agreements.',
    'You analyze ONE contract text and return a structured JSON report.',
    'You provide educational review support, not legal advice. Frame findings as review notes for the compliance office, never as legal conclusions.',
    '',
'Rules of construction:',
'1. Identify what kind of document this is (NIL compensation contract, institutional participation or media-release form, other). Say it in the first sentence of the executive summary.',
'2. Judge only what the contract text says. If the contract is silent about something the rubric requires, report it as missing or unclear.',
'3. Apply the rubric rules given in the user prompt.',
'4. If a rubric rule conflicts with a term the contract states explicitly, the contract term wins: report it as a note for human review instead of a violation.',
'5. Cover EVERY rubric rule. For each rule, either include a finding or add an applicableRules entry explaining why the rule does not apply, was checked and found acceptable, or cannot be evaluated.',
    '6. Every finding MUST include evidence.quote, copied character for character from the contract text between the markers. Do not fix typos, do not clean up spacing, do not reconstruct garbled words. Findings whose quote does not appear in the text get discarded.',
'7. Quote the specific sentence or clause that supports the finding, ideally 10 to 40 words. Never quote the document title, headers, or repeated boilerplate lines.',
'8. If the finding is about something missing or blank, quote the text that shows the gap: the blank field, the signature block, or the closest related clause.',
'9. Never use the same quote for two different findings.',
'10. Never invent clauses, dollar amounts, dates, or parties. If unsure, say so in the summary.',
'11. Severity: high = missing core clause or clear red flag; medium = present but weak or one-sided; low = informational.',
    '12. Order findings from high to low severity, then in the order the rules appear in the rubric.',
    '13. If part of the contract text looks corrupted or garbled, say so in the executive summary instead of reconstructing it.',
    '14. overallRisk: high when core terms such as compensation, parties, or dates are missing, or a serious red flag exists; medium when the contract is mostly complete but has negotiable gaps or one-sided terms; low when only minor informational notes exist.',
    '',
    'Return ONLY a JSON object with exactly this shape (no markdown, no extra keys):',
    JSON.stringify({
      executiveSummary: '2-4 sentences. First sentence states the document type, then the overall read of the contract',
      overallRisk: 'low | medium | high',
      completeness: [{ id: 'payer', provided: true, value: 'text or empty string' }],
      findings: [{
        rubricId: 'F1',
        category: 'legal | fairness | ncaa_institutional',
        severity: 'low | medium | high',
        title: 'short finding title',
        summary: 'what the contract actually says and why it matters',
        recommendation: 'what the compliance office or athlete could ask or negotiate',
        evidence: { quote: 'verbatim quote from the contract text' }
      }],
      applicableRules: [{ rubricId: 'N1', note: 'why this rule applies to this contract' }]
    })
  ].join('\n');
}

export function buildUserPrompt(contractText, context = {}) {
  const rubricLines = RUBRIC_RULES.map((rule) =>
    '- ' + rule.id + ' (' + rule.category + '): ' + rule.title + '. ' + rule.guidance
  );

  const contextLines = [
    context.school ? 'School: ' + context.school : '',
    context.division ? 'Division: ' + context.division : '',
    context.stateName ? 'State: ' + context.stateName : ''
  ].filter(Boolean);

  return [
    'Rubric version: ' + RUBRIC_VERSION,
    '',
    'Athlete institutional context (may be empty):',
    contextLines.length > 0 ? contextLines.join('\n') : '(none)',
    '',
    'Review rubric:',
    rubricLines.join('\n'),
    '',
    'Completeness checklist to report (one entry each):',
    COMPLETENESS_FIELDS.map((field) => '- ' + field.id).join('\n'),
    '',
    'Contract text:',
    '<<<CONTRACT_START>>>',
    contractText,
    '<<<CONTRACT_END>>>'
  ].join('\n');
}
