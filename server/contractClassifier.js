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
  const hasPartyLanguage = normalizedText.includes('between') || normalizedText.includes('parties');
  const hasExecutionLanguage = normalizedText.includes('signature') || normalizedText.includes('signed');
  const hasContractTitle =
    normalizedText.includes('this agreement') ||
    normalizedText.includes('this contract') ||
    normalizedText.startsWith('agreement ') ||
    normalizedText.startsWith('contract ');
  const hasCoreClause =
    normalizedText.includes('term and termination') ||
    normalizedText.includes('termination') ||
    normalizedText.includes('governing law') ||
    normalizedText.includes('confidentiality') ||
    normalizedText.includes('compensation') ||
    normalizedText.includes('consideration') ||
    normalizedText.includes('indemnification') ||
    normalizedText.includes('obligations');
  const hasReadableText = normalizedText.length >= MIN_TEXT_LENGTH;

  const isContract =
    hasReadableText &&
    score >= MIN_ACCEPTANCE_SCORE &&
    negativeScore < positiveScore &&
    textStrongSignalCount >= MIN_TEXT_STRONG_SIGNAL_COUNT &&
    legalCategoryCount >= MIN_LEGAL_CATEGORY_COUNT &&
    (hasContractTitle || hasPartyLanguage) &&
    hasCoreClause &&
    (hasExecutionLanguage || hasPartyLanguage);

  return {
    isContract,
    score,
    positiveSignals: positiveMatches.map(({ phrase }) => phrase),
    negativeSignals: negativeMatches.map(({ phrase }) => phrase),
    legalCategoryCount,
    textLength: normalizedText.length,
    preview: normalizedText.slice(0, 280)
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