// contract analysis pipeline

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyContractText } from './contractClassifier.js';
import { chatCompletion, getAiConfig } from './aiClient.js';
import {
  RUBRIC_VERSION,
  buildSystemPrompt,
  buildUserPrompt
} from './analysisRubric.js';

const MAX_TEXT_CHARS = 120000;
const STANDARD_FONT_DATA_URL =
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../node_modules/pdfjs-dist/standard_fonts'
  ).replace(/\\/g, '/') + '/';

const VALID_SEVERITIES = ['low', 'medium', 'high'];
const VALID_CATEGORIES = ['legal', 'fairness', 'ncaa_institutional'];

// pdfjs gives cleaner text than pdf-parse on some pdfs
async function extractPdfText(fileBuffer) {
  const doc = await getDocument({
    data: new Uint8Array(fileBuffer),
    standardFontDataUrl: STANDARD_FONT_DATA_URL
  }).promise;

  try {
    let text = '';

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      content.items.forEach((item) => {
        text += item.str + (item.hasEOL ? '\n' : ' ');
      });
      text += '\n';
    }

    return text;
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}

function collapseWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

// quotes must exist in the real text
function locateQuote(quote, contractText) {
  const words = collapseWhitespace(quote)
    .split(' ')
    .filter(Boolean)
    .map(escapeRegExp);

  if (words.length === 0) {
    return null;
  }

  let match = null;

  try {
    match = contractText.match(new RegExp(words.join('\\s+'), 'i'));
  } catch (_error) {
    match = null;
  }

  if (!match) {
    return null;
  }

  const start = match.index;

  return {
    quote: match[0],
    start: start,
    end: start + match[0].length
  };
}

function normalizeFindings(rawFindings, contractText) {
  const normalized = [];
  const dropped = [];

  (Array.isArray(rawFindings) ? rawFindings : []).forEach((finding) => {
    const quote = finding && finding.evidence ? finding.evidence.quote : '';
    const grounded = locateQuote(quote, contractText);

    if (!grounded) {
      dropped.push(
        String(finding && finding.rubricId ? finding.rubricId : '??') + ' ' +String(finding && finding.title ? finding.title : 'unnamed finding')
      );
      return;
    }

    const severity = VALID_SEVERITIES.includes(finding.severity)
      ? finding.severity
      : 'medium';
    const category = VALID_CATEGORIES.includes(finding.category)
      ? finding.category
      : 'legal';

    normalized.push({
      id: 'F-' + String(normalized.length + 1).padStart(3, '0'),
      rubricId: String(finding.rubricId || '').toUpperCase(),
      category: category,
      severity: severity,
      title: String(finding.title || 'Untitled finding').slice(0, 120),
      summary: String(finding.summary || '').slice(0, 800),
      recommendation: String(finding.recommendation || '').slice(0, 500),
      matchedTerms: Array.isArray(finding.matchedTerms)
        ? finding.matchedTerms.slice(0, 10)
        : [],
      references: [
        {
          highlightedText: [grounded.quote]
        }
      ],
      evidence: grounded
    });
  });

  return { normalized: normalized, dropped: dropped };
}

function parseModelJson(rawContent) {
  const text = String(rawContent || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');

  if (start < 0 || end <= start) {
    throw new Error('The model did not return a JSON object.');
  }

  return JSON.parse(text.slice(start, end + 1));
}

export async function analyzeContractWithAi(fileBuffer, fileName = '', context = {}) {
  const config = getAiConfig();
  const contractText = await extractPdfText(fileBuffer);

  if (!collapseWhitespace(contractText)) {
    return {
      aiStatus: 'unreadable',
      message: 'No readable text in this PDF (it may be a scan). No analysis was run.',
      gate: null,
      analysis: null
    };
  }

  // cheap gate before the LLM
  const gate = classifyContractText(contractText, fileName);

  if (!gate.isContract) {
    return {
      aiStatus: 'not_a_contract',
      message: 'This file does not look like a NIL contract.',
      gate: gate,
      analysis: null
    };
  }

  const trimmedText =
    contractText.length > MAX_TEXT_CHARS
      ? contractText.slice(0, MAX_TEXT_CHARS)
      : contractText;

  if (!config.enabled) {
    return {
      aiStatus: 'unavailable',
      message: 'AI_API_KEY is not configured, use the rule-based screening instead.',
      gate: gate,
      analysis: null
    };
  }

  try {
    const completion = await chatCompletion({
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt(trimmedText, context)
    });

    const parsed = parseModelJson(
      completion?.choices?.[0]?.message?.content
    );
    const { normalized, dropped } = normalizeFindings(parsed.findings, contractText);

    const analysis = {
      rubricVersion: RUBRIC_VERSION,
      provider: 'openai-compatible',
      model: config.model,
      generatedAt: new Date().toISOString(),
      executiveSummary: String(parsed.executiveSummary || '').slice(0, 1200),
      overallRisk: VALID_SEVERITIES.includes(parsed.overallRisk)
        ? parsed.overallRisk
        : 'medium',
      completeness: Array.isArray(parsed.completeness)
        ? parsed.completeness.slice(0, 20)
        : [],
      findings: normalized,
      applicableRules: Array.isArray(parsed.applicableRules)
        ? parsed.applicableRules.slice(0, 20)
        : [],
      usage: {
        promptTokens: completion?.usage?.prompt_tokens ?? null,
        completionTokens: completion?.usage?.completion_tokens ?? null
      },
      droppedUngroundedFindings: dropped
    };

    return { aiStatus: 'completed', gate: gate, analysis: analysis };
  } catch (error) {
    return {
      aiStatus: 'failed',
      message: error.message || 'The AI analysis failed.',
      gate: gate,
      analysis: null
    };
  }
}
