import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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

function getCurrentUser() {
  const storedUser = localStorage.getItem('nilguard_user');

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser);
  } catch (_error) {
    localStorage.removeItem('nilguard_user');
    return null;
  }
}

function formatDateTime(value) {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
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

function ContractAnalysisPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const contractId = searchParams.get('contractId') || '';
  const fileName = searchParams.get('fileName') || 'Selected Contract';
  const mode = searchParams.get('mode') || 'analyze';
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedFindingId, setSelectedFindingId] = useState('');
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfLoadError, setPdfLoadError] = useState('');
  const [pdfZoom, setPdfZoom] = useState(1);

  useEffect(() => {
    if (!currentUser?.id) {
      navigate('/login');
      return;
    }

    if (!contractId) {
      setErrorMessage('A contract id is required to open the analysis report.');
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadAnalysis = async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const response = await getContractAnalysis(currentUser, contractId);

        if (!isMounted) {
          return;
        }

        const nextAnalysis = response.analysis || null;
        setAnalysis(nextAnalysis);

        if (nextAnalysis?.findings?.length) {
          setSelectedFindingId((currentSelectedFindingId) => currentSelectedFindingId || nextAnalysis.findings[0].id);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error.message || 'Unable to load the contract analysis.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadAnalysis();

    return () => {
      isMounted = false;
    };
  }, [contractId, currentUser?.id, navigate]);

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
    if (!analysis?.findings?.length) {
      return null;
    }

    return analysis.findings.find((finding) => finding.id === selectedFindingId) || analysis.findings[0];
  }, [analysis, selectedFindingId]);

  const summary = analysis?.summary;
  const rules = analysis?.applicableRules || [];
  const findings = analysis?.findings || [];
  const highlightTokens = useMemo(() => getHighlightTokens(selectedFinding), [selectedFinding]);
  const contractFileUrl = currentUser?.id && contractId ? getContractFileUrl(currentUser, contractId) : '';
  const pdfDevicePixelRatio = typeof window !== 'undefined' ? Math.max(window.devicePixelRatio || 1, 2) : 2;
  const pdfPageWidth = Math.round(700 * pdfZoom);
  const pdfFile = useMemo(() => {
    if (!contractFileUrl || !currentUser?.id) {
      return null;
    }

    return {
      url: contractFileUrl,
      httpHeaders: {
        'x-user-id': currentUser.id
      },
      withCredentials: false
    };
  }, [contractFileUrl, currentUser?.id]);

  useEffect(() => {
    setPdfPageCount(0);
    setPdfLoadError('');
  }, [contractFileUrl, selectedFindingId]);

  return (
    <div className="analysis-container">
      <div className="analysis-back-row">
        <Link to="/dashboard/student" className="analysis-exit-link">
          Exit To Student Dashboard
        </Link>
      </div>

      <header className="analysis-header">
        <div>
          <p className="analysis-eyebrow">Contract ID</p>
          <h1>{pageCopy.title}</h1>
          <p>{pageCopy.description}</p>
        </div>

        <div className="analysis-header-meta">
          <div className="analysis-meta-card">
            <span>Contract</span>
            <strong>{contractId || 'Unknown contract'}</strong>
            <small>{fileName}</small>
          </div>
          <div className="analysis-meta-card">
            <span>School Context</span>
            <strong>{summary?.school || currentUser?.school || 'No school assigned'}</strong>
            <small>
              {[summary?.division || currentUser?.ncaaDivision, summary?.stateName || currentUser?.schoolStateName].filter(Boolean).join(' · ') || 'School context unavailable'}
            </small>
          </div>
          <div className="analysis-meta-card">
            <span>Generated</span>
            <strong>{formatDateTime(analysis?.generatedAt)}</strong>
            <small>{mode === 'view' ? 'Latest saved report' : 'Current live analysis'}</small>
          </div>
        </div>
      </header>

      {isLoading ? (
        <section className="analysis-results">
          <div className="analysis-result-item">
            <div className="analysis-result-title">Loading report</div>
            <div className="analysis-result-description">NILGuard is reading the stored PDF and building the compliance review trail.</div>
          </div>
        </section>
      ) : errorMessage ? (
        <section className="analysis-results">
          <div className="analysis-result-item error">
            <div className="analysis-result-title">Analysis unavailable</div>
            <div className="analysis-result-description">{errorMessage}</div>
          </div>
        </section>
      ) : (
        <main className="analysis-grid analysis-report-grid">
          <section className="analysis-results analysis-results-column">
            <div className="analysis-scoreboard">
              <div className={`analysis-score-card ${summary?.topSeverity || 'low'}`}>
                <span>Risk Score</span>
                <strong>{summary?.riskScore ?? 0}</strong>
              </div>
              <div className="analysis-score-card neutral" title="Flagged issues are potential compliance risks or missing required elements detected in the contract.">
                <span>Flagged Issues</span>
                <strong>{summary?.flaggedFindingCount ?? 0}</strong>
                <div className="flagged-issues-info">Potential compliance risks or missing required elements detected in the contract.</div>
              </div>
              <div className="analysis-score-card neutral">
                <span>Passed Checks</span>
                <strong>{summary?.passedCheckpointCount ?? 0}</strong>
              </div>
            </div>

            <div className="analysis-panel">
              <div className="analysis-panel-header">
                <h2>Applicable Rules</h2>
                <p>School, division, and state review profiles used for this report.</p>
              </div>
              <div className="analysis-rule-list">
                {rules.map((rule) => (
                  <article key={rule.id} className="analysis-rule-card">
                    <h3>{rule.title}</h3>
                    <p>{rule.description}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="analysis-panel">
              <div className="analysis-panel-header">
                <h2>Findings</h2>
                <p>Select a finding to inspect the explanation and evidence trail.</p>
              </div>
              <div className="analysis-findings-list">
                {findings.map((finding) => (
                  <button
                    key={finding.id}
                    type="button"
                    className={`analysis-finding-card ${finding.severity} ${selectedFinding?.id === finding.id ? 'active' : ''}`}
                    onClick={() => setSelectedFindingId(finding.id)}
                  >
                    <div className="analysis-finding-header">
                      <span className={`risk-badge ${finding.severity}`}>{getSeverityLabel(finding.severity)}</span>
                      <span className={`analysis-status-pill ${finding.status}`}>{finding.status === 'pass' ? 'Pass' : 'Flagged'}</span>
                    </div>
                    <strong>{finding.title}</strong>
                    <p>{finding.summary}</p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="analysis-results analysis-results-detail">
            <div className="analysis-review-workspace">
              {/* PDF Viewer */}
              <div className="analysis-result-item analysis-pdf-viewer-card">
                <div className="analysis-detail-heading-row">
                  <div>
                    <div className="analysis-result-title">Contract Viewer</div>
                    <h2>{analysis?.contract?.fileName || fileName}</h2>
                  </div>
                  <div className="analysis-pdf-toolbar compact-toolbar" aria-label="PDF zoom controls">
                    <button
                      type="button"
                      title="Zoom out"
                      className="analysis-pdf-zoom-button small"
                      onClick={() => setPdfZoom((currentZoom) => Math.max(0.75, Number((currentZoom - 0.1).toFixed(2))))}
                    >
                      -
                    </button>
                    <span className="analysis-pdf-zoom-label small">{Math.round(pdfZoom * 100)}%</span>
                    <button
                      type="button"
                      title="Zoom in"
                      className="analysis-pdf-zoom-button small"
                      onClick={() => setPdfZoom((currentZoom) => Math.min(2, Number((currentZoom + 0.1).toFixed(2))))}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      title="Reset zoom"
                      className="analysis-pdf-reset-button small"
                      onClick={() => setPdfZoom(1)}
                    >
                      Reset
                    </button>
                  </div>
                </div>
                {pdfFile ? (
                  <div className="analysis-pdf-scroll">
                    <Document
                      file={pdfFile}
                      loading={<div className="analysis-result-description">Loading PDF document...</div>}
                      onLoadSuccess={({ numPages }) => {
                        setPdfPageCount(numPages);
                        setPdfLoadError('');
                      }}
                      onLoadError={(error) => {
                        setPdfLoadError(error?.message || 'The PDF could not be rendered in the embedded viewer.');
                      }}
                      onSourceError={(error) => {
                        setPdfLoadError(error?.message || 'The PDF source could not be loaded.');
                      }}
                    >
                      {pdfLoadError ? (
                        <div className="analysis-result-description">{pdfLoadError}</div>
                      ) : null}
                      {Array.from({ length: pdfPageCount }, (_, index) => (
                        <div key={`${selectedFinding?.id || 'finding'}-${index + 1}`} className="analysis-pdf-page-shell">
                          <Page
                            pageNumber={index + 1}
                            width={pdfPageWidth}
                            devicePixelRatio={pdfDevicePixelRatio}
                            renderAnnotationLayer
                            renderTextLayer
                            customTextRenderer={({ str }) => renderPdfHighlightedText(str, highlightTokens)}
                          />
                        </div>
                      ))}
                    </Document>
                  </div>
                ) : (
                  <div className="analysis-result-description">The PDF viewer is unavailable for this contract.</div>
                )}
              </div>
              {/* Sidebar */}
              <div className="analysis-review-sidebar">
                <div className={`analysis-result-item ${selectedFinding?.severity || 'low'}`}>
                  <div className="analysis-detail-heading-row">
                    <div>
                      <div className="analysis-result-title">Explanation</div>
                      <h2>{selectedFinding?.title || 'No finding selected'}</h2>
                    </div>
                    {selectedFinding ? (
                      <span className={`risk-badge ${selectedFinding.severity}`}>{getSeverityLabel(selectedFinding.severity)}</span>
                    ) : null}
                  </div>
                  <div className="analysis-explanation-block">
                    {renderHighlightedText(
                      selectedFinding?.explanation,
                      highlightTokens,
                      'Select a finding to review NILGuard guidance and evidence.'
                    )}
                  </div>
                  {selectedFinding?.matchedTerms?.length ? (
                    <div className="analysis-term-list">
                      {selectedFinding.matchedTerms.map((term) => (
                        <span key={term} className="analysis-term-pill">{term}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="analysis-result-item">
                  <div className="analysis-result-title">Reference Trail</div>
                  <div className="analysis-reference-list">
                    {(selectedFinding?.references || []).length ? (
                      (selectedFinding?.references || []).map((reference) => (
                        <article key={reference.id} className="analysis-reference-card">
                          <strong>{reference.label}</strong>
                          {renderHighlightedText(
                            reference.excerpt,
                            getHighlightTokens({
                              matchedTerms: selectedFinding?.matchedTerms,
                              references: [reference]
                            }),
                            'No reference excerpt available.'
                          )}
                        </article>
                      ))
                    ) : (
                      <article className="analysis-reference-card">
                        <strong>Review note</strong>
                        <p>No matching clause language was detected for this selected finding.</p>
                      </article>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="analysis-result-item">
              <div className="analysis-result-title">Contract Details</div>
              <div className="analysis-contract-details-grid">
                <div>
                  <span>File Name</span>
                  <strong>{analysis?.contract?.fileName || fileName || 'Not available'}</strong>
                </div>
                <div>
                  <span>Created</span>
                  <strong>{analysis?.contract?.createdAt ? formatDateTime(analysis?.contract?.createdAt) : 'Not available'}</strong>
                </div>
                <div>
                  <span>Last Accessed</span>
                  <strong>{analysis?.contract?.lastAccessedAt ? formatDateTime(analysis?.contract?.lastAccessedAt) : 'Not available'}</strong>
                </div>
                <div>
                  <span>Screening</span>
                  <strong>{typeof summary?.contractScreeningPassed === 'boolean' ? (summary.contractScreeningPassed ? 'Passed initial contract screen' : 'Parsing issue detected') : 'Not available'}</strong>
                </div>
              </div>

              <div className="contract-action-row">
                <Link to="/dashboard/student" className="dashboard-secondary-button">
                  Back To Dashboard
                </Link>
                {contractFileUrl ? (
                  <button
                    type="button"
                    className="dashboard-secondary-button dashboard-accept-button"
                    onClick={() => window.open(contractFileUrl, '_blank', 'noopener,noreferrer')}
                  >
                    Open Original PDF
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

export default ContractAnalysisPage;