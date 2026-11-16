
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ToastMessage } from '../components/ui/toast';

import logo from '../assets/NILGUARD.png';
import moneyIcon from '../assets/moneyModule.png';
import dealIcon from '../assets/dealModule.png';
import contractIcon from '../assets/contractModule.png';
import {
  educationCourses,
  getStudentEducationProgress,
  mergeEducationCourseProgress,
  readLocalEducationProgress,
  saveStudentEducationProgress,
  writeLocalEducationCourse
} from '../services/educationApi';
import '../styles/pages/EducationDashboardpage.css';

function EducationDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [moneyBasicsProgress, setMoneyBasicsProgress] = useState({
    currentLesson: 0,
    completedLessons: []
  });
  const [moneyBasicsQuizResult, setMoneyBasicsQuizResult] = useState(null);
  const [nilDealsProgress, setNilDealsProgress] = useState(null);
  const [nilDealsQuizResult, setNilDealsQuizResult] = useState(null);
  const [contracts101Progress, setContracts101Progress] = useState(null);
  const [contracts101QuizResult, setContracts101QuizResult] = useState(null);
  const [educationError, setEducationError] = useState('');

  const loadEducationData = async () => {
    if (!user?.id) {
      return;
    }

    setEducationError('');

    try {
      const progressResponse = await getStudentEducationProgress();
      const localProgress = readLocalEducationProgress(user.id);
      const savedProgress = {};

      for (const course of educationCourses) {
        const mergedProgress = mergeEducationCourseProgress(
          localProgress[course.id],
          progressResponse.progress?.[course.id]
        );
        const hasSavedProgress = Boolean(
          localProgress[course.id] || progressResponse.progress?.[course.id]
        );

        if (hasSavedProgress) {
          await saveStudentEducationProgress(course.id, mergedProgress);
          writeLocalEducationCourse(user.id, course.id, mergedProgress);
          savedProgress[course.id] = mergedProgress;
        }
      }

      setMoneyBasicsProgress(savedProgress.moneyBasics || { currentLesson: 0, completedLessons: [] });
      setMoneyBasicsQuizResult(savedProgress.moneyBasics?.quizResult || null);
      setNilDealsProgress(savedProgress.nilDeals || null);
      setNilDealsQuizResult(savedProgress.nilDeals?.quizResult || null);
      setContracts101Progress(savedProgress.contracts101 || null);
      setContracts101QuizResult(savedProgress.contracts101?.quizResult || null);
    } catch (error) {
      setEducationError(error.message || 'Unable to load education progress.');
    }
  };

  useEffect(() => {
    loadEducationData();
    window.addEventListener('focus', loadEducationData);

    return () => window.removeEventListener('focus', loadEducationData);
  }, [user?.id]);

  const resetCourse = (courseId) => {
    if (!user?.id) {
      return;
    }

    const resetProgress = { currentLesson: 0, completedLessons: [], quizResult: null };
    writeLocalEducationCourse(user.id, courseId, resetProgress);
    saveStudentEducationProgress(courseId, resetProgress).catch((error) => {
      console.error(`Unable to reset ${courseId} progress:`, error);
    });
  };

  const handleReviewMoneyBasics = () => {
    resetCourse('moneyBasics');
    setMoneyBasicsProgress({ currentLesson: 0, completedLessons: [] });
    setMoneyBasicsQuizResult(null);
    navigate('/student/education/money-basics');
  };

  const handleReviewNILDeals = () => {
    resetCourse('nilDeals');
    setNilDealsProgress(null);
    setNilDealsQuizResult(null);
    navigate('/student/education/nil-deals');
  };

  const handleReviewContracts101 = () => {
    resetCourse('contracts101');
    setContracts101Progress(null);
    setContracts101QuizResult(null);
    navigate('/student/education/contracts');
  };

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
          <div className="learning-logo-wrap">
            <img src={logo} alt="NILGuard Logo" className="learning-logo" />
          </div>
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

        <ToastMessage message={educationError} variant="error" title="Education progress failed" />

        <section className="education-module-grid">

          {/* MODULE 1 */}
          <article className="education-module-card">
            <div className="education-module-icon">
              <img src={moneyIcon} alt="" />
            </div>

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
            <div className="education-module-icon">
              <img src={dealIcon} alt="" />
            </div>

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
            <div className="education-module-icon">
              <img src={contractIcon} alt="" />
            </div>

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

