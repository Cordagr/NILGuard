import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import '../styles/pages/ContractAnalysis.css';
import '../styles/pages/StudentDashboard.css';
import { getContractAnalysis, getContractFileUrl } from '../services/contractApi';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

function formatDateTime(value) {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatElapsedTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return `${minutes}:${seconds}`;
}

function getAiStatusLabel(status) {
  const labels = {
    completed: 'AI review complete',
    failed: 'AI review failed',
    unavailable: 'AI review unavailable',
    unreadable: 'PDF text unavailable',
    not_a_contract: 'Document not identified as a contract'
  };

  return labels[status] || 'AI review status';
}

function getSeverityLabel(severity) {
  if (severity === 'high') {
    return 'High';
  }

  if (severity === 'medium') {
    return 'Medium';
  }

  if (severity === 'low') {
    return 'Low';
  }

  return 'Info';
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getHighlightTokens(finding) {
  const findingTokens = [
    ...(finding?.matchedTerms || []),
    ...((finding?.references || []).flatMap((reference) => reference.highlightedText || []))
  ]
    .map((token) => String(token || '').trim())
    .filter(Boolean);

  return [...new Set(findingTokens)].sort((left, right) => right.length - left.length);
}

function renderHighlightedText(text, tokens, emptyText) {
  const content = String(text || '').trim();

  if (!content) {
    return <p className="analysis-highlighted-copy">{emptyText}</p>;
  }

  if (!tokens.length) {
    return <p className="analysis-highlighted-copy">{content}</p>;
  }

  const matcher = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi');
  const parts = content.split(matcher).filter(Boolean);

  return (
    <p className="analysis-highlighted-copy">
      {parts.map((part, index) => {
        const isHighlighted = tokens.some((token) => token.toLowerCase() === part.toLowerCase());

        if (isHighlighted) {
          return (
            <mark key={`${part}-${index}`} className="analysis-inline-highlight">
              {part}
            </mark>
          );
        }

        return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
      })}
    </p>
  );
}

function renderPdfHighlightedText(text, tokens) {
  const content = String(text || '');

  if (!content || !tokens.length) {
    return escapeHtml(content);
  }

  const matcher = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi');
  const parts = content.split(matcher).filter(Boolean);

  return parts.map((part) => {
    const isHighlighted = tokens.some((token) => token.toLowerCase() === part.toLowerCase());

    if (isHighlighted) {
      return `<mark class="analysis-pdf-highlight">${escapeHtml(part)}</mark>`;
    }

    return escapeHtml(part);
  }).join('');
}

function getEvidenceQuote(finding) {
  const referenceQuote = finding?.references
    ?.flatMap((reference) => reference.highlightedText || [])
    .find(Boolean);

  return String(finding?.evidence?.quote || referenceQuote || '').trim();
}

function getPdfHighlightTokens(finding) {
  const quote = getEvidenceQuote(finding);
  const commonWords = new Set([
    'about', 'after', 'also', 'been', 'between', 'from', 'have', 'into',
    'must', 'shall', 'that', 'their', 'there', 'these', 'this', 'those',
    'under', 'were', 'will', 'with', 'would'
  ]);
  const words = quote.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || [];

  return [...new Set(words
    .filter((word) => word.length >= 4 && !commonWords.has(word.toLowerCase()))
    .map((word) => word.trim()))]
    .slice(0, 12)
    .sort((left, right) => right.length - left.length);
}

function ContractAnalysisPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const currentUserId = currentUser?.id;
  const contractId = searchParams.get('contractId') || '';
  const fileName = searchParams.get('fileName') || 'Selected Contract';
  const mode = searchParams.get('mode') || 'analyze';
  const [analysis, setAnalysis] = useState(null);
  const [contract, setContract] = useState(null);
  const [findings, setFindings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [aiStatus, setAiStatus] = useState('loading');
  const [aiMessage, setAiMessage] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiCacheHit, setAiCacheHit] = useState(false);
  const [isRefreshingAi, setIsRefreshingAi] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [requestStartedAt, setRequestStartedAt] = useState(null);
  const [selectedFindingId, setSelectedFindingId] = useState('');
  const [selectedAiFindingId, setSelectedAiFindingId] = useState('');
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfLoadError, setPdfLoadError] = useState('');
  const [pdfZoom, setPdfZoom] = useState(1);
  const [pdfContainerWidth, setPdfContainerWidth] = useState(540);
  const requestIdRef = useRef(0);
  const pdfContainerRef = useRef(null);

  const loadAnalysis = useCallback(async ({ refresh = false } = {}) => {
    if (!currentUserId) {
      navigate('/login');
      return;
    }

    if (!contractId) {
      setErrorMessage('A contract id is required to open the analysis report.');
      setIsLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const startedAt = Date.now();

    if (refresh) {
      setIsRefreshingAi(true);
    } else {
      setIsLoading(true);
      setErrorMessage('');
      setAiStatus('loading');
    }

    setElapsedSeconds(0);
    setRequestStartedAt(startedAt);

    try {
      const response = await getContractAnalysis(
        { id: currentUserId },
        contractId,
        { refresh }
      );

      if (requestIdRef.current !== requestId) {
        return;
      }

      const nextAnalysis = response.analysis || null;
      const responseFindings = Array.isArray(response.findings) ? response.findings : [];
      const analysisFindings = Array.isArray(nextAnalysis?.findings) ? nextAnalysis.findings : [];
      const resolvedFindings = responseFindings.length > 0 ? responseFindings : analysisFindings;
      const nextAiAnalysis = response.aiAnalysis || null;
      const nextAiFindings = Array.isArray(nextAiAnalysis?.findings) ? nextAiAnalysis.findings : [];

      setAnalysis(nextAnalysis);
      setContract(response.contract || null);
      setFindings(resolvedFindings);
      setAiStatus(response.aiStatus || 'unavailable');
      setAiMessage(response.aiMessage || '');
      setAiAnalysis(nextAiAnalysis);
      setAiCacheHit(Boolean(response.aiCacheHit));

      if (resolvedFindings.length > 0) {
        setSelectedFindingId((currentId) =>
          resolvedFindings.some((finding) => finding.id === currentId)
            ? currentId
            : resolvedFindings[0].id
        );
      }

      if (nextAiFindings.length > 0) {
        setSelectedAiFindingId((currentId) =>
          nextAiFindings.some((finding) => finding.id === currentId)
            ? currentId
            : nextAiFindings[0].id
        );
      } else {
        setSelectedAiFindingId('');
      }
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      const message = error.message || 'Unable to load the contract analysis.';
      console.error('[NILGuard] Contract analysis request failed', {
        stage: refresh ? 'fresh-review' : 'initial-load',
        message
      });

      if (refresh) {
        setAiStatus('failed');
        setAiMessage(message);
      } else {
        setErrorMessage(message);
        setAiStatus('failed');
        setAiMessage(message);
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
        setRequestStartedAt(null);
        if (refresh) {
          setIsRefreshingAi(false);
        } else {
          setIsLoading(false);
        }
      }
    }
  }, [contractId, currentUserId, navigate]);

  useEffect(() => {
    if (!currentUserId) {
      navigate('/login');
      return undefined;
    }

    if (!contractId) {
      setErrorMessage('A contract id is required to open the analysis report.');
      setIsLoading(false);
      return undefined;
    }

    loadAnalysis();

    return () => {
      requestIdRef.current += 1;
    };
  }, [contractId, currentUserId, loadAnalysis, navigate]);

  useEffect(() => {
    if (!requestStartedAt) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - requestStartedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [requestStartedAt]);

  useEffect(() => {
    const container = pdfContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = Math.floor(entries[0]?.contentRect?.width || 540);
      setPdfContainerWidth(Math.max(280, nextWidth - 16));
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const pageCopy = useMemo(() => {
    if (mode === 'view') {
      return {
        title: 'Saved Contract Analysis',
        description: 'Review the latest NCAA division, school, and state regulation checkpoints generated for this contract.'
      };
    }

    return {
      title: 'Contract Analysis',
      description: 'NILGuard screens the agreement against NCAA division safeguards, school context, and configured state-level review profiles.'
    };
  }, [mode]);

  const selectedFinding = useMemo(() => {
    // Keep the current finding visible.
    if (!findings.length) {
      return null;
    }

    return findings.find((finding) => finding.id === selectedFindingId) || findings[0];
  }, [findings, selectedFindingId]);

  const aiFindings = Array.isArray(aiAnalysis?.findings) ? aiAnalysis.findings : [];
  const selectedAiFinding = useMemo(() => {
    if (!aiFindings.length) {
      return null;
    }

    return aiFindings.find((finding) => finding.id === selectedAiFindingId) || aiFindings[0];
  }, [aiFindings, selectedAiFindingId]);
  const aiEvidenceQuote = getEvidenceQuote(selectedAiFinding);
  const pdfHighlightTokens = useMemo(
    () => getPdfHighlightTokens(selectedAiFinding),
    [selectedAiFinding]
  );
  const isAiBusy = isLoading || isRefreshingAi;
  const canRetryAi = ['failed', 'unavailable'].includes(aiStatus) || Boolean(errorMessage);

  const summary = analysis?.summary || {};

  // Keep counts in sync.
  const flaggedCount = findings.filter((f) => f.status === 'flagged').length;
  const passedCount  = findings.filter((f) => f.status === 'pass').length;

  const metrics = {
    riskScore:            summary.riskScore            ?? analysis?.score ?? 0,
    flaggedFindingCount:  summary.flaggedFindingCount  ?? flaggedCount,
    passedCheckpointCount: summary.passedCheckpointCount ?? passedCount,
    topSeverity:          summary.topSeverity          ?? (typeof analysis?.isContract === 'boolean' ? (analysis.isContract ? 'low' : 'high') : 'low'),
    contractScreeningPassed: typeof summary.contractScreeningPassed === 'boolean' ? summary.contractScreeningPassed : analysis?.isContract,
    generatedAt: summary.generatedAt ?? analysis?.generatedAt,
    school:      summary.school,
    division:    summary.division,
    stateName:   summary.stateName
  };

  const highlightTokens = useMemo(() => getHighlightTokens(selectedFinding), [selectedFinding]);
  const contractFileUrl = currentUserId && contractId
    ? getContractFileUrl({ id: currentUserId }, contractId)
    : '';
  const pdfDevicePixelRatio = typeof window !== 'undefined' ? Math.max(window.devicePixelRatio || 1, 2) : 2;
  const pdfPageWidth = Math.round(Math.min(pdfContainerWidth, 760) * pdfZoom);
  const pdfFile = useMemo(() => {
    if (!contractFileUrl || !currentUserId) {
      return null;
    }

    return {
      url: contractFileUrl,
      withCredentials: true
    };
  }, [contractFileUrl, currentUserId]);

  useEffect(() => {
    setPdfPageCount(0);
    setPdfLoadError('');
  }, [contractFileUrl]);

  const sortedFindings = [...findings].sort((a, b) => {
    if (a.status === b.status) return 0;
    if (a.status === 'flagged') return -1;
    if (b.status === 'flagged') return 1;
    return 0;
  });

  const PANEL_PADDING = '1.2rem';
  const TITLE_STYLE = { margin: 0, marginBottom: 10, fontSize: 22 };
  const displayedStatus = isAiBusy ? 'Review in progress' : getAiStatusLabel(aiStatus);
  const displayedStatusClass = isAiBusy
    ? 'loading'
    : ['completed'].includes(aiStatus)
      ? 'complete'
      : ['failed', 'unavailable'].includes(aiStatus) || errorMessage
        ? 'error'
        : 'notice';
  const aiSeverityCounts = aiFindings.reduce((counts, finding) => {
    counts[finding.severity] = (counts[finding.severity] || 0) + 1;
    return counts;
  }, {});

  return (
    <div className="analysis-container">
      <div className="analysis-back-row">
        <Link to="/dashboard/student" className="analysis-exit-link">
          Exit To Student Dashboard
        </Link>
      </div>

      <header className="analysis-header">
        <h1>{pageCopy.title}</h1>
        <p>{pageCopy.description}</p>
      </header>

      <main className="analysis-grid analysis-report-grid">
        <section className="analysis-results analysis-results-column">
          <div className="analysis-panel" style={{ padding: PANEL_PADDING, borderRadius: 8 }}>
            <section className="analysis-ai-section" aria-labelledby="ai-review-heading">
              <div className="analysis-ai-heading">
                <div>
                  <span className="analysis-ai-eyebrow">AI-assisted contract review</span>
                  <h2 id="ai-review-heading">AI Contract Review</h2>
                  <p>Review the model's findings and evidence before making a compliance decision.</p>
                </div>
                <span className={`analysis-ai-status ${displayedStatusClass}`} aria-live="polite">
                  {displayedStatus}
                </span>
              </div>

              {isAiBusy ? (
                <div className="analysis-ai-loading" role="status" aria-live="polite">
                  <span className="analysis-loading-spinner" aria-hidden="true" />
                  <div>
                    <h3>{isRefreshingAi ? 'Running a fresh AI review' : 'Reviewing this agreement'}</h3>
                    <p>The PDF stays open while NILGuard prepares the review.</p>
                    <span className="analysis-elapsed-time">Elapsed: {formatElapsedTime(elapsedSeconds)}</span>
                  </div>
                </div>
              ) : errorMessage ? (
                <div className="analysis-ai-message error" role="alert">
                  <strong>Analysis could not be loaded</strong>
                  <p>{errorMessage}</p>
                  <button type="button" onClick={() => loadAnalysis({ refresh: true })}>
                    Retry analysis
                  </button>
                </div>
              ) : aiAnalysis ? (
                <>
                  {aiStatus !== 'completed' && aiMessage && (
                    <div className="analysis-ai-message error" role="alert">
                      <strong>The latest AI review did not finish</strong>
                      <p>{aiMessage}</p>
                      {aiAnalysis && <span>The previous saved review is still shown below.</span>}
                    </div>
                  )}

                  <div className="analysis-ai-summary">
                    <div className="analysis-ai-summary-heading">
                      <h3>Executive Summary</h3>
                      <span className={`risk-badge ${aiAnalysis.overallRisk || 'info'}`}>
                        Overall risk: {getSeverityLabel(aiAnalysis.overallRisk)}
                      </span>
                    </div>
                    <p>{aiAnalysis.executiveSummary || 'No summary was returned for this review.'}</p>
                    <div className="analysis-ai-meta">
                      {aiAnalysis.model && <span>Model: {aiAnalysis.model}</span>}
                      {aiAnalysis.generatedAt && <span>Reviewed: {formatDateTime(aiAnalysis.generatedAt)}</span>}
                      {aiCacheHit && <span>Using saved analysis</span>}
                    </div>
                  </div>

                  <div className="analysis-ai-counts" aria-label="AI finding counts">
                    <div><strong>{aiFindings.length}</strong><span>Findings</span></div>
                    <div><strong>{aiSeverityCounts.high || 0}</strong><span>High</span></div>
                    <div><strong>{aiSeverityCounts.medium || 0}</strong><span>Medium</span></div>
                    <div><strong>{aiSeverityCounts.low || 0}</strong><span>Low</span></div>
                  </div>

                  <div className="analysis-ai-findings-heading">
                    <h3>AI Findings</h3>
                    <span>Select a finding to highlight matching words in the PDF.</span>
                  </div>

                  {aiFindings.length === 0 ? (
                    <div className="analysis-ai-empty">
                      No findings were returned. Review the applicable rules and full agreement before making a decision.
                    </div>
                  ) : (
                    <div className="analysis-ai-findings-list">
                      {aiFindings.map((finding) => {
                        const quote = getEvidenceQuote(finding);
                        const isSelected = finding.id === selectedAiFinding?.id;

                        return (
                          <button
                            type="button"
                            key={finding.id}
                            className={`analysis-ai-finding ${finding.severity || 'medium'}${isSelected ? ' selected' : ''}`}
                            onClick={() => setSelectedAiFindingId(finding.id)}
                            aria-pressed={isSelected}
                          >
                            <span className="analysis-ai-finding-badges">
                              <span className={`risk-badge ${finding.severity || 'medium'}`}>
                                {getSeverityLabel(finding.severity)} risk
                              </span>
                              {finding.category && <span className="analysis-ai-category">{finding.category.replace(/_/g, ' ')}</span>}
                              {finding.rubricId && <span className="analysis-ai-rubric">{finding.rubricId}</span>}
                            </span>
                            <strong className="analysis-ai-finding-title">{finding.title}</strong>
                            {finding.summary && <span className="analysis-ai-finding-summary">{finding.summary}</span>}
                            {quote && (
                              <span className="analysis-ai-evidence">
                                <b>Evidence from the agreement</b>
                                <span>“{quote}”</span>
                              </span>
                            )}
                            {finding.recommendation && (
                              <span className="analysis-ai-recommendation">
                                <b>Suggested review:</b> {finding.recommendation}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="analysis-ai-actions">
                    <button
                      type="button"
                      className="analysis-ai-run-button"
                      onClick={() => loadAnalysis({ refresh: true })}
                      disabled={isAiBusy}
                    >
                      Run fresh AI review
                    </button>
                    <span>This sends the agreement for a new AI review.</span>
                  </div>
                </>
              ) : (
                <div className={`analysis-ai-message ${canRetryAi ? 'error' : 'notice'}`} role={canRetryAi ? 'alert' : 'status'}>
                  <strong>{getAiStatusLabel(aiStatus)}</strong>
                  <p>{aiMessage || 'The AI review is not available for this agreement.'}</p>
                  {canRetryAi && (
                    <button type="button" onClick={() => loadAnalysis({ refresh: true })}>
                      Retry AI review
                    </button>
                  )}
                </div>
              )}

              <p className="analysis-ai-disclaimer">
                Informational review only. This is not legal advice or a final compliance decision. A compliance officer must review the agreement and make the final determination.
              </p>
            </section>

            <details className="analysis-legacy-checks">
              <summary>
                <span>
                  <strong>Existing Compliance Checks</strong>
                  <small>Rule-based screening, separate from the AI review</small>
                </span>
                {!isLoading && !errorMessage && (
                  <span className="analysis-legacy-counts">{flaggedCount} flagged · {passedCount} passed</span>
                )}
              </summary>

              {isLoading ? (
                <div className="analysis-ai-empty">Loading the existing compliance checks…</div>
              ) : errorMessage ? (
                <div className="analysis-ai-empty">{errorMessage}</div>
              ) : (
                <div className="analysis-legacy-content">
                  <div className="analysis-legacy-metrics">
                    <div><span>Rule risk score</span><strong>{metrics.riskScore}</strong></div>
                    <div><span>Flagged</span><strong>{metrics.flaggedFindingCount}</strong></div>
                    <div><span>Passed</span><strong>{metrics.passedCheckpointCount}</strong></div>
                    <div><span>Last accessed</span><strong>{contract?.lastAccessedAt ? formatDateTime(contract.lastAccessedAt) : 'N/A'}</strong></div>
                    <div><span>Uploaded</span><strong>{contract?.createdAt ? formatDateTime(contract.createdAt) : 'N/A'}</strong></div>
                  </div>

                  <p className="analysis-legacy-note">
                    These checks look for rule-related terms in the extracted text. They are not the AI findings or a legal conclusion.
                  </p>

                  <div className="analysis-findings-list">
                    {sortedFindings.length === 0 && (
                      <div className="analysis-ai-empty">No rule-based checks were returned.</div>
                    )}
                    {sortedFindings.map((finding) => (
                      <article
                        key={finding.id}
                        className={`analysis-finding-card ${finding.severity}`}
                      >
                        <div className="analysis-finding-header">
                          <span className={`risk-badge ${finding.severity}`}>{getSeverityLabel(finding.severity)}</span>
                          <span className={`analysis-status-pill ${finding.status}`}>
                            {finding.status === 'pass' ? 'Pass' : 'Flagged'}
                          </span>
                        </div>
                        <strong>{finding.title}</strong>
                        <p>{finding.summary}</p>
                        {finding.references?.length > 0 && (
                          <div className="analysis-legacy-reference">
                            <strong>Reference Trail</strong>
                            {finding.references.map((reference, index) => (
                              <div key={reference.id || `${finding.id}-${index}`}>
                                {reference.label && <b>{reference.label}</b>}
                                {renderHighlightedText(
                                  reference.excerpt,
                                  getHighlightTokens({ matchedTerms: finding.matchedTerms, references: [reference] }),
                                  'No reference excerpt available.'
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </details>
          </div>
        </section>

        <section className="analysis-pdf-viewer">
          <div className="analysis-pdf-heading">
            <div>
              <h2 style={TITLE_STYLE}>Contract PDF</h2>
              <p>{contract?.fileName || fileName}</p>
            </div>
            <div className="compact-toolbar">
              <button
                className="analysis-pdf-zoom-button small"
                onClick={() => setPdfZoom((zoom) => Math.max(0.5, zoom - 0.1))}
                title="Zoom out"
                aria-label="Zoom out"
              >−</button>
              <span className="analysis-pdf-zoom-label small">{Math.round(pdfZoom * 100)}%</span>
              <button
                className="analysis-pdf-zoom-button small"
                onClick={() => setPdfZoom((zoom) => Math.min(2, zoom + 0.1))}
                title="Zoom in"
                aria-label="Zoom in"
              >+</button>
              <button className="analysis-pdf-reset-button small" onClick={() => setPdfZoom(1)}>Reset</button>
            </div>
          </div>

          {selectedAiFinding && aiEvidenceQuote && (
            <div className="analysis-pdf-evidence-note">
              <strong>Selected evidence</strong>
              <span>{aiEvidenceQuote}</span>
            </div>
          )}

          {pdfFile ? (
            <div className="analysis-pdf-content" ref={pdfContainerRef}>
              <Document
                file={pdfFile}
                onLoadSuccess={({ numPages }) => setPdfPageCount(numPages)}
                onLoadError={(error) => setPdfLoadError(error.message || 'Failed to load PDF')}
                loading={<div className="analysis-pdf-loading">Loading PDF…</div>}
              >
                {Array.from(new Array(pdfPageCount), (_page, index) => (
                  <Page
                    key={`page_${index + 1}`}
                    pageNumber={index + 1}
                    width={pdfPageWidth}
                    devicePixelRatio={pdfDevicePixelRatio}
                    renderAnnotationLayer
                    renderTextLayer
                    customTextRenderer={({ str }) => renderPdfHighlightedText(str, pdfHighlightTokens)}
                  />
                ))}
              </Document>
              {pdfLoadError && <div className="analysis-pdf-error" role="alert">{pdfLoadError}</div>}
            </div>
          ) : (
            <div className="analysis-pdf-loading">No contract PDF is available.</div>
          )}
        </section>
      </main>
    </div>
  );
}

export default ContractAnalysisPage;
