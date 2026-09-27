
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/pages/NILDealsQuiz.css';

const questions = [
  {
    question: 'What is a good approach when reaching out to a potential NIL brand partner?',
    options: [
      'Send the same message to every brand',
      'Send a professional and personalized message',
      'Only ask how much money the brand will pay',
      'Wait for the brand to find you'
    ],
    correctAnswer: 1
  },
  {
    question: 'Which of the following should you review when evaluating an NIL offer?',
    options: [
      'Only the amount of compensation',
      'Only the brand name',
      'Compensation, deliverables, exclusivity, usage rights, and deadlines',
      'Only how many followers the brand has'
    ],
    correctAnswer: 2
  },
  {
    question: 'What are deliverables in an NIL agreement?',
    options: [
      'The specific responsibilities you agree to complete',
      'The amount of money in your bank account',
      'The brand’s number of employees',
      'Your school schedule'
    ],
    correctAnswer: 0
  },
  {
    question: 'What should you do if you are unable to meet an agreed NIL deadline?',
    options: [
      'Ignore the deadline',
      'Delete the agreement',
      'Contact the brand and communicate the situation professionally',
      'Wait until the brand contacts you'
    ],
    correctAnswer: 2
  },
  {
    question: 'Why is it important to understand usage rights in an NIL agreement?',
    options: [
      'They determine how the brand may use your name, image, or content',
      'They determine your class schedule',
      'They determine how many followers you need',
      'They determine which sport you can play'
    ],
    correctAnswer: 0
  }
];

const PASSING_PERCENTAGE = 80;

function NILDealsQuizPage() {
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
      'nilDealsQuizResult',
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
    if (currentQuestion === 0) {
      return;
    }

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
    navigate('/student/education/nil-deals');
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
      <div className="nil-deals-quiz-page">

        <header className="nil-deals-quiz-header">
          <div className="nil-deals-quiz-header-content">

            <div>
              <p className="nil-deals-quiz-eyebrow">
                NILGUARD LEARNING CENTER
              </p>

              <h1>NIL Deal Basics & Partnerships</h1>
            </div>

            <button
              type="button"
              className="nil-deals-quiz-back-button"
              onClick={handleBackToEducation}
            >
              ← Education Dashboard
            </button>

          </div>
        </header>

        <main className="nil-deals-quiz-content">

          <section className="nil-deals-results-card">

            <div className="nil-deals-results-icon">
              {passed ? '✓' : '!'}
            </div>

            <p className="nil-deals-results-label">
              QUICK ASSESSMENT COMPLETE
            </p>

            <h2>
              {passed
                ? 'Great job!'
                : 'Keep learning!'}
            </h2>

            <p className="nil-deals-results-description">
              {passed
                ? 'You passed the NIL Deal Basics & Partnerships assessment.'
                : 'Review the lessons and try the assessment again to reach the passing score.'}
            </p>

            <div className="nil-deals-score-box">

              <span className="nil-deals-score">
                {percentage}%
              </span>

              <span className="nil-deals-score-detail">
                {score} of {questions.length} correct
              </span>

            </div>

            <div
              className={`nil-deals-passing-message ${
                passed ? 'passed' : 'needs-review'
              }`}
            >
              {passed
                ? `✓ Passed — ${PASSING_PERCENTAGE}% or higher is required.`
                : `You need ${PASSING_PERCENTAGE}% to pass. Review the lessons and try again.`}
            </div>

            <div className="nil-deals-results-actions">

              <button
                type="button"
                className="nil-deals-results-secondary"
                onClick={handleBackToModule}
              >
                Review Lessons
              </button>

              <button
                type="button"
                className="nil-deals-results-primary"
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

  const selectedAnswer =
    selectedAnswers[currentQuestion];

  const isLastQuestion =
    currentQuestion === questions.length - 1;

  return (
    <div className="nil-deals-quiz-page">

      <header className="nil-deals-quiz-header">
        <div className="nil-deals-quiz-header-content">

          <div>
            <p className="nil-deals-quiz-eyebrow">
              NILGUARD LEARNING CENTER
            </p>

            <h1>NIL Deal Basics & Partnerships</h1>

            <p className="nil-deals-quiz-subtitle">
              Quick Assessment
            </p>
          </div>

          <button
            type="button"
            className="nil-deals-quiz-back-button"
            onClick={handleBackToModule}
          >
            ← Back to Module
          </button>

        </div>
      </header>

      <main className="nil-deals-quiz-content">

        <section className="nil-deals-quiz-card">

          <div className="nil-deals-quiz-top">

            <div>
              <span className="nil-deals-quiz-label">
                QUESTION {currentQuestion + 1} OF {questions.length}
              </span>

              <h2>
                Test your understanding
              </h2>
            </div>

            <span className="nil-deals-quiz-percentage">
              {Math.round(
                ((currentQuestion + 1) /
                  questions.length) *
                  100
              )}%
            </span>

          </div>

          <div className="nil-deals-quiz-progress-bar">
            <div
              className="nil-deals-quiz-progress-fill"
              style={{
                width: `${
                  ((currentQuestion + 1) /
                    questions.length) *
                  100
                }%`
              }}
            />
          </div>

          <div className="nil-deals-question">

            <h3>
              {question.question}
            </h3>

            <div className="nil-deals-answer-list">

              {question.options.map(
                (option, index) => {

                  const isSelected =
                    selectedAnswer === index;

                  return (
                    <button
                      key={option}
                      type="button"
                      className={`nil-deals-answer ${
                        isSelected
                          ? 'selected'
                          : ''
                      }`}
                      onClick={() =>
                        handleAnswerSelect(index)
                      }
                    >

                      <span className="nil-deals-answer-letter">
                        {String.fromCharCode(
                          65 + index
                        )}
                      </span>

                      <span className="nil-deals-answer-text">
                        {option}
                      </span>

                      <span className="nil-deals-answer-radio">
                        {isSelected ? '✓' : ''}
                      </span>

                    </button>
                  );
                }
              )}

            </div>

          </div>

          <div className="nil-deals-quiz-navigation">

            <button
              type="button"
              className="nil-deals-quiz-secondary"
              onClick={handlePrevious}
              disabled={currentQuestion === 0}
            >
              ← Previous
            </button>

            <button
              type="button"
              className="nil-deals-quiz-primary"
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

export default NILDealsQuizPage;

