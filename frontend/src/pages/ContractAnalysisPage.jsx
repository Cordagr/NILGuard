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
  const [contract, setContract] = useState(null);
  const [findings, setFindings] = useState([]);
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
        setContract(response.contract || null);

        // FIX: Try response.findings first, then fall back to analysis.findings.
        // This handles APIs that nest findings inside the analysis object.
        const responsefindings = Array.isArray(response.findings) ? response.findings : [];
        const analysisFingings = Array.isArray(nextAnalysis?.findings) ? nextAnalysis.findings : [];
        const resolvedFindings = responsefindings.length > 0 ? responsefindings : analysisFingings;
        setFindings(resolvedFindings);

        if (resolvedFindings.length > 0) {
          setSelectedFindingId((currentSelectedFindingId) => currentSelectedFindingId || resolvedFindings[0].id);
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
    // Read from the findings state (same array used to render the list)
    if (!findings.length) {
      return null;
    }

    return findings.find((finding) => finding.id === selectedFindingId) || findings[0];
  }, [findings, selectedFindingId]);

  const summary = analysis?.summary || {};

  // Derive metrics: prefer summary fields, fall back to computed values from the findings state
  // so the numbers always match what is actually rendered in the list.
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

  const rules = analysis?.applicableRules || [];
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

  const sortedFindings = [...findings].sort((a, b) => {
    if (a.status === b.status) return 0;
    if (a.status === 'flagged') return -1;
    if (b.status === 'flagged') return 1;
    return 0;
  });

  // Shared values so both panels are pixel-identical in vertical start position
  const PANEL_MARGIN_TOP = 4;
  const PANEL_PADDING = '1.2rem';
  const TITLE_STYLE = { margin: 0, marginBottom: 10, fontSize: 22 };

  return (
    <div className="analysis-container" style={{ padding: '0.5em 0.2em', minHeight: '100vh' }}>
      <div className="analysis-back-row" style={{ marginBottom: 0 }}>
        <Link to="/dashboard/student" className="analysis-exit-link">
          Exit To Student Dashboard
        </Link>
      </div>

      <header className="analysis-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 8, marginTop: 8 }}>
        <h1 style={{ textAlign: 'center', fontSize: 32, margin: 0 }}>{pageCopy.title}</h1>
        <p style={{ textAlign: 'center', fontSize: 16, margin: '8px 0 0 0', maxWidth: 700 }}>{pageCopy.description}</p>
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
        <main className="analysis-grid analysis-report-grid" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minHeight: '80vh', width: '100%' }}>

          {/* LEFT — Compliance Checks */}
          <section className="analysis-results analysis-results-column" style={{ flex: '0 0 50%', maxWidth: '50%', minWidth: 0, marginTop: PANEL_MARGIN_TOP }}>
            <div className="analysis-panel" style={{ padding: PANEL_PADDING, borderRadius: 8 }}>

              <h2 style={TITLE_STYLE}>Compliance Checks</h2>

              {/* Metrics strip — below title */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #0001', padding: '0.5rem 1rem', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Score</div>
                  <div style={{ fontWeight: 700, color: '#b85c00', fontSize: 16 }}>{metrics.riskScore}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Flagged</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{metrics.flaggedFindingCount}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Passed</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{metrics.passedCheckpointCount}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last</div>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{contract?.lastAccessedAt ? formatDateTime(contract.lastAccessedAt) : 'N/A'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Created</div>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{contract?.createdAt ? formatDateTime(contract.createdAt) : 'N/A'}</div>
                </div>
              </div>

              {/* Debug line — remove once confirmed working */}
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>
                Showing {sortedFindings.length} finding{sortedFindings.length !== 1 ? 's' : ''} ({flaggedCount} flagged, {passedCount} passed)
              </div>

              <div className="analysis-findings-list">
                {sortedFindings.length === 0 && (
                  <div style={{ padding: '0.5rem', color: '#888' }}>No compliance checks found.</div>
                )}
                {sortedFindings.map((finding) => (
                  <div key={finding.id} className={`analysis-finding-card ${finding.severity}`} style={{ marginBottom: 10, background: finding.status === 'pass' ? '#f6fff6' : '#fff', padding: '0.75rem', borderRadius: 6 }}>
                    <div className="analysis-finding-header" style={{ marginBottom: 2 }}>
                      <span className={`risk-badge ${finding.severity}`} style={{ fontSize: 12 }}>{getSeverityLabel(finding.severity)}</span>
                      <span className={`analysis-status-pill ${finding.status}`} style={{ fontSize: 12 }}>{finding.status === 'pass' ? 'Pass' : 'Flagged'}</span>
                    </div>
                    <strong style={{ fontSize: 15 }}>{finding.title}</strong>
                    <p style={{ fontSize: 13, margin: '2px 0 0 0' }}>{finding.summary}</p>
                    {finding.references && finding.references.length > 0 && (
                      <div style={{ marginTop: 8, background: '#f8f8f8', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
                        <div style={{ fontWeight: 600, marginBottom: 2, fontSize: 13 }}>Reference Trail</div>
                        {finding.references.map((reference) => (
                          <div key={reference.id} style={{ marginBottom: 6 }}>
                            <strong>{reference.label}</strong>
                            <div>{renderHighlightedText(reference.excerpt, getHighlightTokens({ matchedTerms: finding.matchedTerms, references: [reference] }), 'No reference excerpt available.')}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* RIGHT — Contract PDF */}
          <section className="analysis-pdf-viewer" style={{ flex: '0 0 50%', maxWidth: '50%', minWidth: 0, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #0001', padding: PANEL_PADDING, marginTop: PANEL_MARGIN_TOP, marginBottom: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '90vh', overflow: 'auto' }}>

            <h2 style={{ ...TITLE_STYLE, alignSelf: 'flex-start' }}>Contract PDF</h2>

            {pdfFile ? (
              <div style={{ width: '100%', textAlign: 'center' }}>
                <div className="compact-toolbar" style={{ marginBottom: 8 }}>
                  <button className="analysis-pdf-zoom-button small" onClick={() => setPdfZoom(z => Math.max(0.5, z - 0.1))} title="Zoom Out">-</button>
                  <span className="analysis-pdf-zoom-label small">{Math.round(pdfZoom * 100)}%</span>
                  <button className="analysis-pdf-zoom-button small" onClick={() => setPdfZoom(z => Math.min(2, z + 0.1))} title="Zoom In">+</button>
                  <button className="analysis-pdf-reset-button small" onClick={() => setPdfZoom(1)} title="Reset Zoom">Reset</button>
                </div>
                <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'auto', background: '#fafafa', padding: 6, maxHeight: '80vh' }}>
                  <Document
                    file={pdfFile}
                    onLoadSuccess={({ numPages }) => setPdfPageCount(numPages)}
                    onLoadError={err => setPdfLoadError(err.message || 'Failed to load PDF')}
                    loading={<div style={{ padding: 24 }}>Loading PDF...</div>}
                  >
                    {Array.from(new Array(pdfPageCount), (el, idx) => (
                      <Page
                        key={`page_${idx + 1}`}
                        pageNumber={idx + 1}
                        width={pdfPageWidth + 200}
                        scale={pdfZoom}
                        renderAnnotationLayer={true}
                        renderTextLayer={true}
                      />
                    ))}
                  </Document>
                  {pdfLoadError && <div style={{ color: 'red', marginTop: 8 }}>{pdfLoadError}</div>}
                </div>
              </div>
            ) : (
              <div style={{ color: '#888', padding: 16 }}>No contract PDF available.</div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}

export default ContractAnalysisPage;