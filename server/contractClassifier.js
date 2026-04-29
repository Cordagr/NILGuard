import { PDFParse } from 'pdf-parse';

const POSITIVE_SIGNALS = [
  { phrase: 'agreement', weight: 4, strong: true },
  { phrase: 'contract', weight: 4, strong: true },
  { phrase: 'this agreement', weight: 3, strong: true },
  { phrase: 'this contract', weight: 3, strong: true },
  { phrase: 'parties', weight: 3, strong: true },
  { phrase: 'party', weight: 2, strong: false },
  { phrase: 'between', weight: 2, strong: false },
  { phrase: 'term and termination', weight: 4, strong: true },
  { phrase: 'termination', weight: 3, strong: true },
  { phrase: 'governing law', weight: 3, strong: true },
  { phrase: 'compensation', weight: 3, strong: true },
  { phrase: 'consideration', weight: 3, strong: true },
  { phrase: 'obligations', weight: 3, strong: true },
  { phrase: 'confidentiality', weight: 3, strong: true },
  { phrase: 'indemnification', weight: 3, strong: true },
  { phrase: 'breach', weight: 2, strong: false },
  { phrase: 'signature', weight: 2, strong: false },
  { phrase: 'signed', weight: 2, strong: false },
  { phrase: 'effective date', weight: 2, strong: false },
  { phrase: 'endorsement', weight: 2, strong: false },
  { phrase: 'name, image, and likeness', weight: 5, strong: true },
  { phrase: 'name image likeness', weight: 5, strong: true },
  { phrase: 'nil', weight: 1, strong: false },
  { phrase: 'student-athlete', weight: 3, strong: false },
  { phrase: 'student athlete', weight: 3, strong: false }
];

const NEGATIVE_SIGNALS = [
  { phrase: 'roster', weight: 4 },
  { phrase: 'schedule', weight: 3 },
  { phrase: 'syllabus', weight: 4 },
  { phrase: 'transcript', weight: 4 },
  { phrase: 'resume', weight: 4 },
  { phrase: 'invoice', weight: 4 },
  { phrase: 'receipt', weight: 4 },
  { phrase: 'menu', weight: 4 },
  { phrase: 'brochure', weight: 4 },
  { phrase: 'slide', weight: 3 },
  { phrase: 'presentation', weight: 3 },
  { phrase: 'agenda', weight: 3 },
  { phrase: 'assignment', weight: 3 },
  { phrase: 'homework', weight: 3 },
  { phrase: 'quiz', weight: 3 }
];

const FILENAME_SIGNALS = [
  { phrase: 'contract', weight: 3, strong: true },
  { phrase: 'agreement', weight: 3, strong: true },
  { phrase: 'nil', weight: 1, strong: false }
];

const MIN_TEXT_LENGTH = 120;
const MIN_ACCEPTANCE_SCORE = 10;
const MIN_TEXT_STRONG_SIGNAL_COUNT = 2;
const MIN_LEGAL_CATEGORY_COUNT = 3;

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function collectSignalMatches(text, rules) {
  return rules.filter(({ phrase }) => text.includes(phrase));
}

function sumSignalWeights(matches) {
  return matches.reduce((total, match) => total + match.weight, 0);
}

function countStrongSignals(matches) {
  return matches.filter((match) => match.strong).length;
}

function countMatchedCategories(text) {
  const categories = [
    ['title', ['agreement', 'contract', 'this agreement', 'this contract']],
    ['parties', ['between', 'parties', 'party']],
    ['commercial', ['compensation', 'consideration', 'endorsement', 'name, image, and likeness', 'name image likeness', 'nil']],
    ['legalClauses', ['term and termination', 'termination', 'governing law', 'confidentiality', 'indemnification', 'breach', 'obligations', 'effective date']],
    ['execution', ['signature', 'signed']]
  ];

  return categories.filter(([, phrases]) => phrases.some((phrase) => text.includes(phrase))).length;
}

export function classifyContractText(text, fileName = '') {
  const normalizedText = normalizeText(text);
  const normalizedFileName = normalizeText(fileName);
  const positiveMatches = collectSignalMatches(normalizedText, POSITIVE_SIGNALS);
  const negativeMatches = collectSignalMatches(normalizedText, NEGATIVE_SIGNALS);
  const fileNameMatches = collectSignalMatches(normalizedFileName, FILENAME_SIGNALS);
  const positiveScore = sumSignalWeights(positiveMatches) + sumSignalWeights(fileNameMatches);
  const negativeScore = sumSignalWeights(negativeMatches);
  const score = positiveScore - negativeScore;
  const textStrongSignalCount = countStrongSignals(positiveMatches);
  const legalCategoryCount = countMatchedCategories(normalizedText);
  const hasReadableText = normalizedText.length >= MIN_TEXT_LENGTH;

  // Compliance rules: each is a function that returns a finding if the clause is missing/risky
  const complianceRules = [
    {
      id: 'missing-compensation',
      title: 'Missing Compensation Clause',
      summary: 'The contract does not mention compensation, consideration, or payment.',
      check: (t) => !t.includes('compensation') && !t.includes('consideration') && !t.includes('payment'),
    },
    {
      id: 'missing-termination',
      title: 'Missing Termination Clause',
      summary: 'The contract does not mention a termination date or termination clause.',
      check: (t) => !t.includes('termination'),
    },
    {
      id: 'missing-governing-law',
      title: 'Missing Governing Law Clause',
      summary: 'The contract does not specify a governing law.',
      check: (t) => !t.includes('governing law'),
    },
    {
      id: 'missing-signature',
      title: 'Missing Signature Block',
      summary: 'The contract does not mention a signature or signed section.',
      check: (t) => !t.includes('signature') && !t.includes('signed'),
    },
    {
      id: 'missing-party-definitions',
      title: 'Missing Party Definitions',
      summary: 'The contract does not define the parties (e.g., "between", "parties").',
      check: (t) => !t.includes('between') && !t.includes('parties'),
    },
    {
      id: 'missing-nil-disclosure',
      title: 'Missing NIL Disclosure',
      summary: 'The contract does not mention NIL (Name, Image, and Likeness) rights.',
      check: (t) => !t.includes('name, image, and likeness') && !t.includes('name image likeness') && !t.includes('nil'),
    },
    {
      id: 'missing-exclusivity',
      title: 'Missing Exclusivity Statement',
      summary: 'The contract does not mention exclusivity or non-exclusivity.',
      check: (t) => !t.includes('exclusive') && !t.includes('exclusivity') && !t.includes('non-exclusive'),
    },
  ];

  // Run compliance rules
  // Show both flagged and passed checks
  const complianceFindings = complianceRules.map((rule) => {
    const failed = rule.check(normalizedText);
    return failed
      ? {
          id: `compliance-${rule.id}`,
          title: rule.title,
          summary: rule.summary,
          severity: 'high',
          status: 'flagged',
          matchedTerms: [],
          references: []
        }
      : {
          id: `compliance-${rule.id}`,
          title: rule.title.replace('Missing ', ''),
          summary: `The contract contains a valid ${rule.title.replace('Missing ', '').replace('Clause', '').toLowerCase()}.`,
          severity: 'low',
          status: 'pass',
          matchedTerms: [],
          references: []
        };
  });

  // Optionally, keep keyword findings for debugging/metrics
  const keywordFindings = [];
  // Uncomment below to show keyword findings as well:
  // (analysis.positiveSignals || []).map((signal, idx) => ({
  //   id: `finding-${idx + 1}`,
  //   title: `Flagged Issue: "${signal}"`,
  //   summary: `The contract contains the flagged term or clause: "${signal}".`,
  //   severity: 'medium',
  //   status: 'flagged',
  //   matchedTerms: [signal],
  //   references: []
  // }));

  const isContract =
    hasReadableText &&
    score >= MIN_ACCEPTANCE_SCORE &&
    negativeScore < positiveScore &&
    textStrongSignalCount >= MIN_TEXT_STRONG_SIGNAL_COUNT &&
    legalCategoryCount >= MIN_LEGAL_CATEGORY_COUNT;

  return {
    isContract,
    score,
    positiveSignals: positiveMatches.map(({ phrase }) => phrase),
    negativeSignals: negativeMatches.map(({ phrase }) => phrase),
    legalCategoryCount,
    textLength: normalizedText.length,
    preview: normalizedText.slice(0, 280),
    findings: [...complianceFindings, ...keywordFindings]
  };
}

export async function analyzeContractPdf(fileBuffer, fileName = '') {
  const parser = new PDFParse({ data: fileBuffer });

  try {
    const textResult = await parser.getText();
    return classifyContractText(textResult.text, fileName);
  } catch (_error) {
    return {
      isContract: false,
      score: 0,
      positiveSignals: [],
      negativeSignals: [],
      legalCategoryCount: 0,
      textLength: 0,
      preview: ''
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}