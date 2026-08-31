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

function normalizeExtractedValue(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function collectSignalMatches(text, rules) {
  return rules.filter(({ phrase }) => text.includes(phrase));
}

function sumSignalWeights(matches) {
  return matches.reduce(
    (total, match) => total + match.weight,
    0
  );
}

function countStrongSignals(matches) {
  return matches.filter((match) => match.strong).length;
}

function countMatchedCategories(text) {
  const categories = [
    [
      'title',
      ['agreement', 'contract', 'this agreement', 'this contract']
    ],
    [
      'parties',
      ['between', 'parties', 'party']
    ],
    [
      'commercial',
      [
        'compensation',
        'consideration',
        'endorsement',
        'name, image, and likeness',
        'name image likeness',
        'nil'
      ]
    ],
    [
      'legalClauses',
      [
        'term and termination',
        'termination',
        'governing law',
        'confidentiality',
        'indemnification',
        'breach',
        'obligations',
        'effective date'
      ]
    ],
    [
      'execution',
      ['signature', 'signed']
    ]
  ];

  return categories.filter(([, phrases]) =>
    phrases.some((phrase) => text.includes(phrase))
  ).length;
}

function parseDateToISO(value) {
  const input = normalizeExtractedValue(value);

  if (!input) {
    return '';
  }

  const monthNames = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11
  };

  const longDate = input.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i
  );

  if (longDate) {
    const month =
      monthNames[longDate[1].toLowerCase()];
    const day = Number(longDate[2]);
    const year = Number(longDate[3]);

    return `${year}-${String(month + 1).padStart(
      2,
      '0'
    )}-${String(day).padStart(2, '0')}`;
  }

  const numericDate = input.match(
    /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/
  );

  if (numericDate) {
    const month = Number(numericDate[1]);
    const day = Number(numericDate[2]);
    const year = Number(numericDate[3]);

    if (
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      return `${year}-${String(month).padStart(
        2,
        '0'
      )}-${String(day).padStart(2, '0')}`;
    }
  }

  return '';
}

function extractAgreementMetadata(text) {
  const source = String(text || '')
    .replace(/\r/g, '')
    .replace(/\u00ad/g, '')
    .replace(/[\u2010-\u2015]/g, '-');

  const lines = source
    .split('\n')
    .map((line) => normalizeExtractedValue(line))
    .filter(Boolean);

  const metadata = {
    athleteName: '',
    brandPayer: '',
    contractValue: '',
    startDate: '',
    endDate: '',
    deliverables: [],
    paymentStatus: 'Not recorded',
    disclosureStatus: 'Pending',
    amendments: []
  };

  function isValidAthleteName(value) {
    const candidate = normalizeExtractedValue(value)
      .replace(/^[-:]+/, '')
      .trim();

    if (!candidate || candidate.length > 120) {
      return false;
    }

    const normalized = candidate
      .toLowerCase()
      .replace(/[_\s]+/g, ' ')
      .trim();

    if (
      [
        'name',
        'title',
        'by',
        'athlete',
        'student-athlete',
        'student athlete',
        'company'
      ].includes(normalized)
    ) {
      return false;
    }

    if (/^(?:name|title|by)\s*:/i.test(candidate)) {
      return false;
    }

    if (/^[_\s-]+$/.test(candidate)) {
      return false;
    }

    return /[A-Za-z]/.test(candidate);
  }

  /* ATHLETE NAME ------------------------------------------------ */
  const athleteSectionMatch = source.match(
    /\bATHLETE\b([\s\S]{0,1800}?)(?=\bBRAND\s*\/\s*PAYER\b|\bBRAND\b\s*\/\s*PAYER|\bCOMPANY\b|\b3\.\s*COMPANY\b)/i
  );

  const athleteSearchArea = athleteSectionMatch
    ? athleteSectionMatch[1]
    : source;

  const athletePatterns = [
    /(?:^|\n)\s*Name\s*:\s*([^\n\r]+)/i,
    /\b(?:athlete|student[- ]athlete)\s+name\s*:\s*([^\n\r,;]+)/i,
    /\bName\s*:\s*([^\n\r,;]+?)(?=\s+(?:University|School|Sport)\s*:|[,;\n\r]|$)/i,
    /\bATHLETE\b[\s\S]{0,900}?\bName\s*:\s*([^\n\r,;]+)/i
  ];

  for (const pattern of athletePatterns) {
    const match = athleteSearchArea.match(pattern) || source.match(pattern);
    if (match && isValidAthleteName(match[1])) {
      metadata.athleteName = normalizeExtractedValue(match[1]);
      break;
    }
  }

  /* BRAND / PAYER ---------------------------------------------- */
  const companyLine = lines.find((line) => /^company\s*:/i.test(line));

  if (companyLine) {
    metadata.brandPayer = normalizeExtractedValue(
      companyLine.replace(/^company\s*:\s*/i, '')
    );
  }

  if (!metadata.brandPayer) {
    const betweenMatch = source.match(
      /\bby\s+and\s+between\s+(.+?)\s+\((?:[“"']?)company(?:[”"']?)\)\s+and\b/i
    );

    if (betweenMatch) {
      metadata.brandPayer = normalizeExtractedValue(betweenMatch[1]);
    }
  }

  if (!metadata.brandPayer) {
    const payerLine = lines.find((line) =>
      /^(brand|payer|brand\s*\/\s*payer)\s*:/i.test(line)
    );

    if (payerLine) {
      metadata.brandPayer = normalizeExtractedValue(
        payerLine.replace(
          /^(brand|payer|brand\s*\/\s*payer)\s*:\s*/i,
          ''
        )
      );
    }
  }

  /* CONTRACT DATES --------------------------------------------- */
  const termPatterns = [
    /\b(?:this\s+)?license\s+is\s+effective\s+from\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})\s*,?\s*to\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
    /\b(?:this\s+)?license\s+is\s+effective\s+from\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\s*,?\s*to\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i,
    /\b(?:NIL\s+license\s+term|license\s+term)\b[\s\S]{0,350}?\bStart\s*Date\s*:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})\s*[,;]?\s*\bEnd\s*Date\s*:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
    /\b(?:NIL\s+license\s+term|license\s+term)\b[\s\S]{0,350}?\bStart\s*Date\s*:\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\s*[,;]?\s*\bEnd\s*Date\s*:\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i,
    /\bStart\s*Date\s*:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})\s*[,;]?\s*\bEnd\s*Date\s*:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
    /\bStart\s*Date\s*:\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\s*[,;]?\s*\bEnd\s*Date\s*:\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i,
    /\bterm\s+of\s+use\s*:\s*(?:this\s+license\s+is\s+)?effective\s+from\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})\s*,?\s*to\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
    /\b(?:NIL\s+license\s+term|license\s+term)\s*:?[\s\S]{0,200}?([A-Za-z]+\s+\d{1,2},\s+\d{4})\s*(?:to|[-–])\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i
  ];

  for (const pattern of termPatterns) {
    const match = source.match(pattern);

    if (match) {
      const startDate = parseDateToISO(match[1]);
      const endDate = parseDateToISO(match[2]);

      if (startDate || endDate) {
        metadata.startDate = startDate;
        metadata.endDate = endDate;
        break;
      }
    }
  }

  if (!metadata.startDate || !metadata.endDate) {
    const termStartIndex = lines.findIndex((line) =>
      /^(?:nil\s+license\s+term|term\s+of\s+use|license\s+term)\s*:?\s*$/i.test(line)
    );

    if (termStartIndex >= 0) {
      const followingLines = lines.slice(termStartIndex + 1, termStartIndex + 10);
      const termText = followingLines.join(' ');

      const startLine = followingLines.find((line) => /^start\s*date\s*:/i.test(line));
      const endLine = followingLines.find((line) => /^end\s*date\s*:/i.test(line));

      if (startLine) {
        metadata.startDate = parseDateToISO(
          startLine.replace(/^start\s*date\s*:\s*/i, '')
        );
      }

      if (endLine) {
        metadata.endDate = parseDateToISO(
          endLine.replace(/^end\s*date\s*:\s*/i, '')
        );
      }

      const dateValues = termText.match(
        /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/gi
      ) || [];

      if (!metadata.startDate && dateValues[0]) {
        metadata.startDate = parseDateToISO(dateValues[0]);
      }

      if (!metadata.endDate && dateValues[1]) {
        metadata.endDate = parseDateToISO(dateValues[1]);
      }
    }
  }

  if (!metadata.startDate) {
    const startMatch = source.match(
      /\bstart\s*date\s*:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i
    );

    if (startMatch) {
      metadata.startDate = parseDateToISO(startMatch[1]);
    }
  }

  if (!metadata.endDate) {
    const endMatch = source.match(
      /\bend\s*date\s*:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i
    );

    if (endMatch) {
      metadata.endDate = parseDateToISO(endMatch[1]);
    }
  }

  /* CONTRACT VALUE --------------------------------------------- */
  const compensationMatch = source.match(
    /(?:total\s+compensation|payment\s+and\s+compensation|compensation\s+(?:to\s+be\s+paid|payable|of)|provide\s+athlete|pay\s+the\s+athlete\s+(?:a\s+total\s+of\s+)?)[^$]{0,250}\$\s*([\d,]+(?:\.\d{2})?)/i
  );

  if (compensationMatch) {
    metadata.contractValue = `$${compensationMatch[1]}`;
  } else {
    const dollarAmounts = source.match(/\$\s*[\d,]+(?:\.\d{2})?/g) || [];

    const likelyCompensation = dollarAmounts.find((amount) =>
      /compensation|payment|pay|fee/i.test(
        source.slice(
          Math.max(0, source.indexOf(amount) - 120),
          source.indexOf(amount) + 120
        )
      )
    );

    if (likelyCompensation) {
      metadata.contractValue = normalizeExtractedValue(likelyCompensation);
    }
  }

  /* DELIVERABLES / SERVICES ------------------------------------ */
  const servicesStartIndex = lines.findIndex((line) =>
    /^(?:[a-z]\.\s*)?services\s*:/i.test(line)
  );

  if (servicesStartIndex >= 0) {
    const extracted = [];
    const serviceLines = lines.slice(servicesStartIndex + 1);

    for (const line of serviceLines) {
      if (
        /^(?:[a-z]\.\s+)(?:non-disparagement|non-compete|payment|termination|indemnification|miscellaneous)\b/i.test(line) ||
        /^(?:\d+\.\s*)?(?:company\s+duties|termination|indemnification|miscellaneous)\b/i.test(line) ||
        /^\d+\.\s*$/.test(line)
      ) {
        break;
      }

      const numbered = line.match(/^(?:i+\.\s*)?(\d+)\.\s*(.+)$/i);

      if (numbered) {
        extracted.push(numbered[2]);
      } else if (extracted.length) {
        extracted[extracted.length - 1] = normalizeExtractedValue(
          `${extracted[extracted.length - 1]} ${line}`
        );
      }
    }

    metadata.deliverables = extracted
      .map(normalizeExtractedValue)
      .filter(Boolean);
  }

  /* AMENDMENTS / CHANGES --------------------------------------- */
  function cleanAmendmentNotes(value) {
    return normalizeExtractedValue(value)
      .replace(/^[:\-–—\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function addAmendment(date, notes, heading = 'Amendment') {
    const normalizedNotes = cleanAmendmentNotes(notes);
    const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(
      String(date || '')
    )
      ? String(date)
      : parseDateToISO(date);

    if (!normalizedDate && !normalizedNotes) {
      return;
    }

    const duplicate = metadata.amendments.some(
      (item) =>
        item.date === normalizedDate &&
        item.notes === normalizedNotes
    );

    if (!duplicate) {
      metadata.amendments.push({
        date: normalizedDate,
        notes: normalizedNotes || heading
      });
    }
  }

  const amendmentHeadingRegex = /(?:^|\n)\s*((?:(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s+)?amendment(?:\s+(?:no\.?|number|#)?\s*\d+)?(?:\s+(?:to|of)\s+(?:this\s+)?(?:agreement|contract|license))?|amendment\s+to\s+(?:this\s+)?(?:agreement|contract|license)|amended\s+(?:and\s+restated\s+)?(?:agreement|contract|license))\s*[:\-]?/gi;

  const amendmentMatches = [];
  let amendmentMatch;

  while ((amendmentMatch = amendmentHeadingRegex.exec(source)) !== null) {
    amendmentMatches.push({
      heading: normalizeExtractedValue(amendmentMatch[1]),
      index: amendmentMatch.index,
      contentStart: amendmentMatch.index + amendmentMatch[0].length
    });
  }

  /* PDF extraction sometimes collapses a heading onto the previous line. */
  const collapsedHeadingRegex = /\b((?:(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s+)?amendment(?:\s+(?:no\.?|number|#)?\s*\d+)?(?:\s+(?:to|of)\s+(?:this\s+)?(?:agreement|contract|license))?)\b/gi;

  while ((amendmentMatch = collapsedHeadingRegex.exec(source)) !== null) {
    const before = source.slice(Math.max(0, amendmentMatch.index - 80), amendmentMatch.index);
    const alreadyCaptured = amendmentMatches.some(
      (item) => Math.abs(item.index - amendmentMatch.index) < 8
    );

    const looksLikeHeading =
      !alreadyCaptured &&
      (before.trim() === '' ||
        /(?:\n|\f)\s*$/i.test(before) ||
        /(?:agreement|contract|license)\s*$/i.test(before));

    if (looksLikeHeading) {
      amendmentMatches.push({
        heading: normalizeExtractedValue(amendmentMatch[1]),
        index: amendmentMatch.index,
        contentStart: amendmentMatch.index + amendmentMatch[0].length
      });
    }
  }

  amendmentMatches
    .sort((a, b) => a.index - b.index)
    .forEach((match, index) => {
      const nextIndex = amendmentMatches[index + 1]?.index || source.length;
      let amendmentText = source
        .slice(match.contentStart, nextIndex)
        .replace(/\f/g, '\n')
        .trim();

      if (amendmentText.length > 2200) {
        amendmentText = amendmentText.slice(0, 2200).trim();
      }

      const dateMatch = amendmentText.match(
        /\b(?:dated|date|amendment\s+date|effective(?:\s+date)?|effective\s+as\s+of)\s*(?:on|as\s+of)?\s*[:,-]?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i
      ) || amendmentText.match(
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i
      );

      const numericDateMatch = amendmentText.match(
        /\b(?:dated|date|amendment\s+date|effective(?:\s+date)?|effective\s+as\s+of)\s*(?:on|as\s+of)?\s*[:,-]?\s*(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/i
      ) || amendmentText.match(
        /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/i
      );

      let amendmentDate = '';

      if (dateMatch) {
        amendmentDate = parseDateToISO(
          `${dateMatch[1]} ${dateMatch[2]}, ${dateMatch[3]}`
        );
      } else if (numericDateMatch) {
        amendmentDate = parseDateToISO(
          `${numericDateMatch[1]}/${numericDateMatch[2]}/${numericDateMatch[3]}`
        );
      }

      const notes = amendmentText
        .replace(
          /^(?:dated|date|amendment\s+date|effective(?:\s+date)?|effective\s+as\s+of)\s*(?:on|as\s+of)?\s*[:,-]?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\.?/i,
          ''
        )
        .replace(
          /^(?:dated|date|amendment\s+date|effective(?:\s+date)?|effective\s+as\s+of)\s*(?:on|as\s+of)?\s*[:,-]?\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\.?/i,
          ''
        );

      addAmendment(amendmentDate, notes, match.heading);
    });

  /* Also support explicit fields such as "Amendment Date:" even when
     the PDF has no standalone AMENDMENT heading. */
  const explicitAmendmentRegex = /\bAmendment\s*(?:Date|Effective\s+Date)\s*:\s*([^\n\r]+)/gi;
  let explicitMatch;

  while ((explicitMatch = explicitAmendmentRegex.exec(source)) !== null) {
    const value = explicitMatch[1].trim();
    const date = parseDateToISO(value);
    const contextStart = Math.max(0, explicitMatch.index - 250);
    const contextEnd = Math.min(source.length, explicitMatch.index + 700);
    const context = source.slice(contextStart, contextEnd);
    const contextNotes = context
      .replace(explicitMatch[0], '')
      .replace(/\s+/g, ' ')
      .trim();

    addAmendment(date, contextNotes, 'Amendment');
  }

  /* PAYMENT STATUS --------------------------------------------- */
  if (/\bpayment\s+status\s*[:\-]\s*paid\b/i.test(source)) {
    metadata.paymentStatus = 'Paid';
  } else if (/\bpayment\s+status\s*[:\-]\s*(?:pending|unpaid)\b/i.test(source)) {
    metadata.paymentStatus = 'Pending';
  }

  return metadata;
}

export function classifyContractText(
  text,
  fileName = ''
) {
  const normalizedText =
    normalizeText(text);

  const normalizedFileName =
    normalizeText(fileName);

  const positiveMatches =
    collectSignalMatches(
      normalizedText,
      POSITIVE_SIGNALS
    );

  const negativeMatches =
    collectSignalMatches(
      normalizedText,
      NEGATIVE_SIGNALS
    );

  const fileNameMatches =
    collectSignalMatches(
      normalizedFileName,
      FILENAME_SIGNALS
    );

  const positiveScore =
    sumSignalWeights(
      positiveMatches
    ) +
    sumSignalWeights(
      fileNameMatches
    );

  const negativeScore =
    sumSignalWeights(
      negativeMatches
    );

  const score =
    positiveScore -
    negativeScore;

  const textStrongSignalCount =
    countStrongSignals(
      positiveMatches
    );

  const legalCategoryCount =
    countMatchedCategories(
      normalizedText
    );

  const hasReadableText =
    normalizedText.length >=
    MIN_TEXT_LENGTH;

  const complianceRules = [
    {
      id: 'missing-compensation',
      title: 'Missing Compensation Clause',
      summary:
        'The contract does not mention compensation, consideration, or payment.',
      check: (t) =>
        !t.includes('compensation') &&
        !t.includes('consideration') &&
        !t.includes('payment')
    },

    {
      id: 'missing-termination',
      title: 'Missing Termination Clause',
      summary:
        'The contract does not mention a termination date or termination clause.',
      check: (t) =>
        !t.includes('termination')
    },

    {
      id: 'missing-governing-law',
      title: 'Missing Governing Law Clause',
      summary:
        'The contract does not specify a governing law.',
      check: (t) =>
        !t.includes('governing law')
    },

    {
      id: 'missing-signature',
      title: 'Missing Signature Block',
      summary:
        'The contract does not mention a signature or signed section.',
      check: (t) =>
        !t.includes('signature') &&
        !t.includes('signed')
    },

    {
      id: 'missing-party-definitions',
      title: 'Missing Party Definitions',
      summary:
        'The contract does not define the parties (e.g., "between", "parties").',
      check: (t) =>
        !t.includes('between') &&
        !t.includes('parties')
    },

    {
      id: 'missing-nil-disclosure',
      title: 'Missing NIL Disclosure',
      summary:
        'The contract does not mention NIL (Name, Image, and Likeness) rights.',
      check: (t) =>
        !t.includes(
          'name, image, and likeness'
        ) &&
        !t.includes(
          'name image likeness'
        ) &&
        !t.includes('nil')
    },

    {
      id: 'missing-exclusivity',
      title: 'Missing Exclusivity Statement',
      summary:
        'The contract does not mention exclusivity or non-exclusivity.',
      check: (t) =>
        !t.includes('exclusive') &&
        !t.includes('exclusivity') &&
        !t.includes('non-exclusive')
    }
  ];

  const complianceFindings =
    complianceRules.map((rule) => {
      const failed =
        rule.check(normalizedText);

      if (failed) {
        return {
          id: `compliance-${rule.id}`,
          title: rule.title,
          summary: rule.summary,
          severity: 'high',
          status: 'flagged',
          matchedTerms: [],
          references: []
        };
      }

      return {
        id: `compliance-${rule.id}`,
        title: rule.title.replace(
          'Missing ',
          ''
        ),
        summary: `The contract contains a valid ${rule.title
          .replace('Missing ', '')
          .replace('Clause', '')
          .toLowerCase()}.`,
        severity: 'low',
        status: 'pass',
        matchedTerms: [],
        references: []
      };
    });

  const isContract =
    hasReadableText &&
    score >= MIN_ACCEPTANCE_SCORE &&
    negativeScore < positiveScore &&
    textStrongSignalCount >=
      MIN_TEXT_STRONG_SIGNAL_COUNT &&
    legalCategoryCount >=
      MIN_LEGAL_CATEGORY_COUNT;

  return {
    isContract,
    score,
    positiveSignals:
      positiveMatches.map(
        ({ phrase }) => phrase
      ),
    negativeSignals:
      negativeMatches.map(
        ({ phrase }) => phrase
      ),
    legalCategoryCount,
    textLength:
      normalizedText.length,
    preview:
      normalizedText.slice(0, 280),

    agreementMetadata:
      extractAgreementMetadata(text),

    findings: complianceFindings
  };
}

export async function analyzeContractPdf(
  fileBuffer,
  fileName = ''
) {
  const parser = new PDFParse({
    data: fileBuffer
  });

  try {
    const textResult =
      await parser.getText();

    return classifyContractText(
      textResult.text,
      fileName
    );
  } catch (_error) {
    return {
      isContract: false,
      score: 0,
      positiveSignals: [],
      negativeSignals: [],
      legalCategoryCount: 0,
      textLength: 0,
      preview: '',
      agreementMetadata: {
        athleteName: '',
        brandPayer: '',
        contractValue: '',
        startDate: '',
        endDate: '',
        deliverables: [],
        paymentStatus:
          'Not recorded',
        disclosureStatus:
          'Pending',
        amendments: []
      },
      findings: []
    };
  } finally {
    await parser
      .destroy()
      .catch(() => undefined);
  }
}