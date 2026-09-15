
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import '../styles/pages/EducationDashboardpage.css';

function EducationDashboardPage() {
  const navigate = useNavigate();

  const handleReviewMoneyBasics = () => {
  localStorage.removeItem('moneyBasicsProgress');
  localStorage.removeItem('moneyBasicsQuizResult');

  setMoneyBasicsProgress({
    currentLesson: 0,
    completedLessons: [],
  });

  setMoneyBasicsQuizResult(null);

  navigate('/student/education/money-basics');
};

const handleReviewNILDeals = () => {
  localStorage.removeItem('nilDealsProgress');
  localStorage.removeItem('nilDealsQuizResult');

  setNilDealsProgress(null);
  setNilDealsQuizResult(null);

  navigate('/student/education/nil-deals');
};

const handleReviewContracts101 = () => {
  localStorage.removeItem('contracts101Progress');
  localStorage.removeItem('contracts101QuizResult');

  setContracts101Progress(null);
  setContracts101QuizResult(null);

  navigate('/student/education/contracts');
};

  const [moneyBasicsProgress, setMoneyBasicsProgress] = useState({
    currentLesson: 0,
    completedLessons: [],
  });
  const [moneyBasicsQuizResult, setMoneyBasicsQuizResult] =
  useState(null);

  const [nilDealsProgress, setNilDealsProgress] = useState(null);
const [nilDealsQuizResult, setNilDealsQuizResult] = useState(null);

const [contracts101Progress, setContracts101Progress] = useState(null);
const [contracts101QuizResult, setContracts101QuizResult] = useState(null);


  useEffect(() => {
  const loadEducationProgress = () => {

    const savedMoneyBasicsProgress =
      localStorage.getItem('moneyBasicsProgress');

    if (savedMoneyBasicsProgress) {
      try {
        setMoneyBasicsProgress(
          JSON.parse(savedMoneyBasicsProgress)
        );
      } catch {
        setMoneyBasicsProgress(null);
      }
    }

    const savedMoneyBasicsQuizResult =
      localStorage.getItem('moneyBasicsQuizResult');

    if (savedMoneyBasicsQuizResult) {
      try {
        setMoneyBasicsQuizResult(
          JSON.parse(savedMoneyBasicsQuizResult)
        );
      } catch {
        setMoneyBasicsQuizResult(null);
      }
    }

    const savedNilDealsProgress =
      localStorage.getItem('nilDealsProgress');

    if (savedNilDealsProgress) {
      try {
        setNilDealsProgress(
          JSON.parse(savedNilDealsProgress)
        );
      } catch {
        setNilDealsProgress(null);
      }
    }

    const savedNilDealsQuizResult =
      localStorage.getItem('nilDealsQuizResult');

    if (savedNilDealsQuizResult) {
      try {
        setNilDealsQuizResult(
          JSON.parse(savedNilDealsQuizResult)
        );
      } catch {
        setNilDealsQuizResult(null);
      }
    }

    const savedContracts101Progress =
  localStorage.getItem('contracts101Progress');

if (savedContracts101Progress) {
  try {
    setContracts101Progress(
      JSON.parse(savedContracts101Progress)
    );
  } catch {
    setContracts101Progress(null);
  }
}

const savedContracts101QuizResult =
  localStorage.getItem('contracts101QuizResult');

if (savedContracts101QuizResult) {
  try {
    setContracts101QuizResult(
      JSON.parse(savedContracts101QuizResult)
    );
  } catch {
    setContracts101QuizResult(null);
  }
}
  };

  loadEducationProgress();

  window.addEventListener(
    'focus',
    loadEducationProgress
  );

  return () => {
    window.removeEventListener(
      'focus',
      loadEducationProgress
    );
  };
}, []);

  const completedCount = moneyBasicsProgress.completedLessons.length;
  const totalLessons = 3;
  const quizPassed =
  moneyBasicsQuizResult?.passed === true;

const moduleCompleted =
  completedCount === totalLessons && quizPassed;

  const hasStartedMoneyBasics =
  completedCount > 0 ||
  moneyBasicsProgress.currentLesson > 0 ||
  moneyBasicsQuizResult !== null;

const moneyBasicsButtonText = moduleCompleted
  ? 'Review Module →'
  : hasStartedMoneyBasics
    ? 'Resume Module →'
    : 'Start Module →';


const nilDealsCompletedLessons =
  nilDealsProgress?.completedLessons?.length ?? 0;

const nilDealsTotalLessons = 3;


const nilDealsHasStarted =
  nilDealsCompletedLessons > 0 ||
  nilDealsProgress?.currentLesson > 0 ||
  nilDealsQuizResult !== null;

const nilDealsQuizPassed =
  nilDealsQuizResult?.passed === true;

const nilDealsModuleCompleted =
  nilDealsCompletedLessons === nilDealsTotalLessons &&
  nilDealsQuizPassed;

const nilDealsButtonText = nilDealsModuleCompleted
  ? 'Review Module →'
  : nilDealsHasStarted
    ? 'Resume Module →'
    : 'Start Module →';

  
const contracts101CompletedLessons =
  contracts101Progress?.completedLessons?.length ?? 0;

const contracts101TotalLessons = 3;

const contracts101HasStarted =
  contracts101CompletedLessons > 0 ||
  contracts101Progress?.currentLesson > 0 ||
  contracts101QuizResult !== null;

const contracts101QuizPassed =
  contracts101QuizResult?.passed === true;

const contracts101ModuleCompleted =
  contracts101CompletedLessons === contracts101TotalLessons &&
  contracts101QuizPassed;

const contracts101ButtonText = contracts101ModuleCompleted
  ? 'Review Module →'
  : contracts101HasStarted
    ? 'Resume Module →'
    : 'Start Module →';

return (
    <div className="education-page">
      <header className="education-header">
        <div>
          <p className="education-eyebrow">NILGUARD LEARNING CENTER</p>

          <h1>Education & Financial Literacy</h1>

          <p className="education-subtitle">
            Build the knowledge and confidence you need to manage your money,
            evaluate NIL opportunities, and understand your contracts.
          </p>
        </div>

        <button
          type="button"
          className="education-back-button"
          onClick={() => navigate('/dashboard/student')}
        >
          ← Back to Dashboard
        </button>
      </header>

      <main className="education-content">
        <section className="education-intro">
          <h2>Learning Modules</h2>

          <p>
            Choose a module below to start learning. Each module will include
            lessons followed by a quick assessment.
          </p>
        </section>

        <section className="education-module-grid">

          {/* MODULE 1 */}
          <article className="education-module-card">
            <div className="education-module-icon">💰</div>

            <div className="education-module-content">
              <span className="education-module-label">MODULE 1</span>

              <h3>Money Basics & Habits</h3>

              <p>
                Learn how to track your cash flow, understand your sources of
                income, and build a personal budget.
              </p>

              <ul>
                <li>Tracking cash flow</li>
                <li>Understanding sources of income</li>
                <li>Building a personal budget</li>
              </ul>

              {/* Progress */}
              {hasStartedMoneyBasics && (
                <div className="education-progress">
                  <div className="education-progress-header">
                    <span> Progress </span>
                    <span>
                      {completedCount} of {totalLessons} lessons completed
                    </span>
                  </div>

                  <div className="education-progress-bar">
                    <div
                      className="education-progress-fill"
                      style={{
                        width: `${(completedCount / totalLessons) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
              {moneyBasicsQuizResult && (
  <div className="education-quiz-result">
    {quizPassed ? (
      <>
        <span className="education-quiz-status passed">
          ✓ Assessment Passed
        </span>

        <span className="education-quiz-score">
          {moneyBasicsQuizResult.percentage}%
        </span>
      </>
    ) : (
      <>
        <span className="education-quiz-status needs-review">
          Assessment Needs Review
        </span>

        <span className="education-quiz-score">
          {moneyBasicsQuizResult.score}/
                    {moneyBasicsQuizResult.totalQuestions}{' '}
          {moneyBasicsQuizResult.percentage}%
        </span>
      </>
    )}
  </div>
)}

{moduleCompleted && (
  <div className="education-module-complete">
    ✓ Module Complete
  </div>
)}

              <button
  type="button"
  className="education-module-button"
  onClick={
    moduleCompleted
      ? handleReviewMoneyBasics
      : () => navigate('/student/education/money-basics')
  }
>
  {moneyBasicsButtonText}
</button>
            </div>
          </article>

          {/* MODULE 2 */}
          <article className="education-module-card">
            <div className="education-module-icon">🤝</div>

            <div className="education-module-content">
              <span className="education-module-label">MODULE 2</span>

              <h3>NIL Deal Basics & Partnerships</h3>

              <p>
                Learn how to approach brands, evaluate NIL opportunities, and
                manage endorsement relationships.
              </p>

              <ul>
                <li>Brand outreach</li>
                <li>Evaluating NIL offers</li>
                <li>Managing endorsements</li>
              </ul>

              {nilDealsHasStarted && (
  <div className="education-progress">
    <div className="education-progress-header">
      <span> Progress </span>

      <span>
        {nilDealsCompletedLessons} of {nilDealsTotalLessons} lessons completed
      </span>
    </div>

    <div className="education-progress-bar">
      <div
        className="education-progress-fill"
        style={{
          width: `${
            (nilDealsCompletedLessons / nilDealsTotalLessons) * 100
          }%`,
        }}
      />
    </div>
  </div>
)}

              

              {nilDealsQuizResult && (
                <div className="education-quiz-result">
                  <span
                    className={`education-quiz-status ${
                      nilDealsQuizPassed ? 'passed' : 'needs-review'
                    }`}
                  >
                    {nilDealsQuizPassed
                      ? '✓ Assessment Passed'
                      : 'Assessment Needs Review'}
                  </span>

                  <span className="education-quiz-score">
                    {nilDealsQuizResult.score}/
                    {nilDealsQuizResult.totalQuestions}{' '}
                    ({nilDealsQuizResult.percentage}%)
                  </span>
                </div>
              )}

              {nilDealsModuleCompleted && (
                <div className="education-module-complete">
                  ✓ Module Complete
                </div>
              )}

              <button
  type="button"
  className="education-module-button"
  onClick={
    nilDealsModuleCompleted
      ? handleReviewNILDeals
      : () => navigate('/student/education/nil-deals')
  }
>
  {nilDealsButtonText}
</button>
            </div>
          </article>

          {/* MODULE 3 */}
          <article className="education-module-card">
            <div className="education-module-icon">📄</div>

            <div className="education-module-content">
              <span className="education-module-label">MODULE 3</span>

              <h3>Contracts 101</h3>

              <p>
                Understand important contract terms, legal obligations, and
                when you should seek professional review.
              </p>

              <ul>
                <li>Identifying restrictive clauses</li>
                <li>Understanding legal obligations</li>
                <li>Knowing when to seek professional review</li>
              </ul>

              {contracts101HasStarted && (
  <div className="education-progress">
    <div className="education-progress-header">
      <span> Progress </span>

      <span>
        {contracts101CompletedLessons} of {contracts101TotalLessons} lessons completed
      </span>
    </div>

    <div className="education-progress-bar">
      <div
        className="education-progress-fill"
        style={{
          width: `${
            (contracts101CompletedLessons / contracts101TotalLessons) * 100
          }%`,
        }}
      />
    </div>
  </div>
)}



              

              {contracts101QuizResult && (
  <div className="education-quiz-result">
    <span
      className={`education-quiz-status ${
        contracts101QuizPassed ? 'passed' : 'needs-review'
      }`}
    >
      {contracts101QuizPassed
        ? '✓ Assessment Passed'
        : 'Assessment Needs Review'}
    </span>

    <span className="education-quiz-score">
      {contracts101QuizResult.score}/
      {contracts101QuizResult.totalQuestions}
      {' '}
      ({contracts101QuizResult.percentage}%)
    </span>
  </div>
)}

{contracts101ModuleCompleted && (
  <div className="education-module-complete">
    ✓ Module Complete
  </div>
)}

<button
  type="button"
  className="education-module-button"
  onClick={
    contracts101ModuleCompleted
      ? handleReviewContracts101
      : () => navigate('/student/education/contracts')
  }
>
  {contracts101ButtonText}
</button>
            </div>
          </article>

        </section>
      </main>
    </div>
  );
}

export default EducationDashboardPage;

