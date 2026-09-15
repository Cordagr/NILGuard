
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/pages/Contracts101Quiz.css';

const questions = [
  {
    question: 'What is the purpose of reviewing the terms of an NIL contract before signing?',
    options: [
      'To make the contract longer',
      'To understand your responsibilities, compensation, and other important terms',
      'To avoid completing any deliverables',
      'To guarantee that the brand will offer more money'
    ],
    correctAnswer: 1
  },
  {
    question: 'Which contract term may limit an athlete from working with competing brands?',
    options: [
      'Exclusivity',
      'Compensation',
      'School schedule',
      'Contact information'
    ],
    correctAnswer: 0
  },
  {
    question: 'Why are usage rights important in an NIL agreement?',
    options: [
      'They determine your class schedule',
      'They determine how many followers you need',
      'They explain how the brand may use your name, image, likeness, or content',
      'They determine which sport you can play'
    ],
    correctAnswer: 2
  },
  {
    question: 'What should you do if you do not understand an important or restrictive contract clause?',
    options: [
      'Sign the contract immediately',
      'Ignore the clause',
      'Ask a qualified professional or appropriate school NIL/compliance resource for guidance',
      'Delete the contract'
    ],
    correctAnswer: 2
  },
  {
    question: 'When should an athlete consider getting professional review of an NIL contract?',
    options: [
      'Only after violating the agreement',
      'When the agreement is complicated, contains significant restrictions, or the athlete is unsure about the obligations',
      'Only when the brand refuses to answer questions',
      'Never, because NIL contracts are always simple'
    ],
    correctAnswer: 1
  }
];

const PASSING_PERCENTAGE = 80;

function Contracts101QuizPage() {
  const navigate = useNavigate();

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);

  const question = questions[currentQuestion];

  const handleAnswerSelect = (answerIndex) => {
    setSelectedAnswers((previous) => ({
      ...previous,
      [currentQuestion]: answerIndex
    }));
  };

  const calculateScore = () => {
    return questions.reduce((total, item, index) => {
      if (selectedAnswers[index] === item.correctAnswer) {
        return total + 1;
      }

      return total;
    }, 0);
  };

  const saveQuizResult = (finalScore) => {
    const percentage = Math.round(
      (finalScore / questions.length) * 100
    );

    const passed = percentage >= PASSING_PERCENTAGE;

    const result = {
      score: finalScore,
      totalQuestions: questions.length,
      percentage,
      passed,
      completedAt: new Date().toISOString()
    };

    localStorage.setItem(
      'contracts101QuizResult',
      JSON.stringify(result)
    );
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });

      return;
    }

    const finalScore = calculateScore();

    setScore(finalScore);
    saveQuizResult(finalScore);
    setShowResults(true);

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handlePrevious = () => {
    if (currentQuestion === 0) return;

    setCurrentQuestion(currentQuestion - 1);

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleRetake = () => {
    setCurrentQuestion(0);
    setSelectedAnswers({});
    setScore(0);
    setShowResults(false);

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleBackToModule = () => {
    navigate('/student/education/contracts');
  };

  const handleBackToEducation = () => {
    navigate('/student/education');
  };

  if (showResults) {
    const percentage = Math.round(
      (score / questions.length) * 100
    );

    const passed = percentage >= PASSING_PERCENTAGE;

    return (
      <div className="contracts101-quiz-page">

        <header className="contracts101-quiz-header">
          <div className="contracts101-quiz-header-content">

            <div>
              <p className="contracts101-quiz-eyebrow">
                NILGUARD LEARNING CENTER
              </p>

              <h1>Contracts 101</h1>
            </div>

            <button
              type="button"
              className="contracts101-quiz-back-button"
              onClick={handleBackToEducation}
            >
              ← Education Dashboard
            </button>

          </div>
        </header>

        <main className="contracts101-quiz-content">

          <section className="contracts101-results-card">

            <div className="contracts101-results-icon">
              {passed ? '✓' : '!'}
            </div>

            <p className="contracts101-results-label">
              QUICK ASSESSMENT COMPLETE
            </p>

            <h2>
              {passed ? 'Great job!' : 'Keep learning!'}
            </h2>

            <p className="contracts101-results-description">
              {passed
                ? 'You passed the Contracts 101 assessment.'
                : 'Review the lessons and try the assessment again to reach the passing score.'}
            </p>

            <div className="contracts101-score-box">
              <span className="contracts101-score">
                {percentage}%
              </span>

              <span className="contracts101-score-detail">
                {score} of {questions.length} correct
              </span>
            </div>

            <div
              className={`contracts101-passing-message ${
                passed ? 'passed' : 'needs-review'
              }`}
            >
              {passed
                ? `✓ Passed — ${PASSING_PERCENTAGE}% or higher is required.`
                : `You need ${PASSING_PERCENTAGE}% to pass. Review the lessons and try again.`}
            </div>

            <div className="contracts101-results-actions">

              <button
                type="button"
                className="contracts101-results-secondary"
                onClick={handleBackToModule}
              >
                Review Lessons
              </button>

              <button
                type="button"
                className="contracts101-results-primary"
                onClick={handleRetake}
              >
                Retake Assessment
              </button>

            </div>

          </section>

        </main>
      </div>
    );
  }

  const selectedAnswer = selectedAnswers[currentQuestion];

  const isLastQuestion =
    currentQuestion === questions.length - 1;

  return (
    <div className="contracts101-quiz-page">

      <header className="contracts101-quiz-header">
        <div className="contracts101-quiz-header-content">

          <div>
            <p className="contracts101-quiz-eyebrow">
              NILGUARD LEARNING CENTER
            </p>

            <h1>Contracts 101</h1>

            <p className="contracts101-quiz-subtitle">
              Quick Assessment
            </p>
          </div>

          <button
            type="button"
            className="contracts101-quiz-back-button"
            onClick={handleBackToModule}
          >
            ← Back to Module
          </button>

        </div>
      </header>

      <main className="contracts101-quiz-content">

        <section className="contracts101-quiz-card">

          <div className="contracts101-quiz-top">

            <div>
              <span className="contracts101-quiz-label">
                QUESTION {currentQuestion + 1} OF {questions.length}
              </span>

              <h2>Test your understanding</h2>
            </div>

            <span className="contracts101-quiz-percentage">
              {Math.round(
                ((currentQuestion + 1) /
                  questions.length) *
                  100
              )}%
            </span>

          </div>

          <div className="contracts101-quiz-progress-bar">
            <div
              className="contracts101-quiz-progress-fill"
              style={{
                width: `${
                  ((currentQuestion + 1) /
                    questions.length) *
                  100
                }%`
              }}
            />
          </div>

          <div className="contracts101-question">

            <h3>{question.question}</h3>

            <div className="contracts101-answer-list">

              {question.options.map((option, index) => {

                const isSelected =
                  selectedAnswer === index;

                return (
                  <button
                    key={option}
                    type="button"
                    className={`contracts101-answer ${
                      isSelected ? 'selected' : ''
                    }`}
                    onClick={() =>
                      handleAnswerSelect(index)
                    }
                  >

                    <span className="contracts101-answer-letter">
                      {String.fromCharCode(65 + index)}
                    </span>

                    <span className="contracts101-answer-text">
                      {option}
                    </span>

                    <span className="contracts101-answer-radio">
                      {isSelected ? '✓' : ''}
                    </span>

                  </button>
                );
              })}

            </div>
          </div>

          <div className="contracts101-quiz-navigation">

            <button
              type="button"
              className="contracts101-quiz-secondary"
              onClick={handlePrevious}
              disabled={currentQuestion === 0}
            >
              ← Previous
            </button>

            <button
              type="button"
              className="contracts101-quiz-primary"
              onClick={handleNext}
              disabled={selectedAnswer === undefined}
            >
              {isLastQuestion
                ? 'Submit Assessment'
                : 'Next Question →'}
            </button>

          </div>

        </section>

      </main>
    </div>
  );
}

export default Contracts101QuizPage;

