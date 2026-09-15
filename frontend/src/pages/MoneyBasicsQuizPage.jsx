
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/pages/MoneyBasicsQuiz.css';

const questions = [
  {
    id: 1,
    question: 'What does cash flow represent?',
    options: [
      'Only your monthly income',
      'Money coming into and going out of your account',
      'Only your monthly expenses',
      'Money saved for emergencies'
    ],
    answer: 1
  },
  {
    id: 2,
    question: 'Which of the following is an example of NIL income?',
    options: [
      'A brand paying you for an endorsement',
      'Your rent payment',
      'Your phone bill',
      'A grocery purchase'
    ],
    answer: 0
  },
  {
    id: 3,
    question: 'Why is tracking expenses important?',
    options: [
      'It guarantees you will make more money',
      'It eliminates all taxes',
      'It helps you understand where your money is going',
      'It prevents you from needing a budget'
    ],
    answer: 2
  },
  {
    id: 4,
    question: 'What should you consider before making a large purchase?',
    options: [
      'Whether your friends approve',
      'Whether you can spend your entire paycheck',
      'Whether the purchase is expensive',
      'Whether essential expenses and savings are covered'
    ],
    answer: 3
  },
  {
    id: 5,
    question: 'What is the main purpose of a personal budget?',
    options: [
      'To prevent you from spending any money',
      'To create a plan for how you will use your money',
      'To calculate your GPA',
      'To determine your NIL eligibility'
    ],
    answer: 1
  }
];

function MoneyBasicsQuizPage() {
  const navigate = useNavigate();

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answers, setAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);

  const question = questions[currentQuestion];
  const totalQuestions = questions.length;

  const handleAnswerSelect = (answerIndex) => {
    setSelectedAnswer(answerIndex);

    setAnswers((previous) => ({
      ...previous,
      [currentQuestion]: answerIndex
    }));
  };

  const calculateScore = () => {
    return questions.reduce((score, item, index) => {
      if (answers[index] === item.answer) {
        return score + 1;
      }

      return score;
    }, 0);
  };

  const saveQuizResult = (score) => {
    const percentage = Math.round((score / totalQuestions) * 100);
    const passed = percentage >= 80;

    const quizResult = {
      score,
      totalQuestions,
      percentage,
      passed,
      completedAt: new Date().toISOString()
    };

    localStorage.setItem(
      'moneyBasicsQuizResult',
      JSON.stringify(quizResult)
    );

    return {
      percentage,
      passed
    };
  };

  const handleNext = () => {
    if (selectedAnswer === null) {
      return;
    }

    if (currentQuestion < totalQuestions - 1) {
      const nextQuestion = currentQuestion + 1;

      setCurrentQuestion(nextQuestion);

      setSelectedAnswer(
        answers[nextQuestion] !== undefined
          ? answers[nextQuestion]
          : null
      );

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } else {
      const score = calculateScore();

      saveQuizResult(score);

      setShowResults(true);

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  const handlePrevious = () => {
    if (currentQuestion === 0) {
      return;
    }

    const previousQuestion = currentQuestion - 1;

    setCurrentQuestion(previousQuestion);

    setSelectedAnswer(
      answers[previousQuestion] !== undefined
        ? answers[previousQuestion]
        : null
    );

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleRetake = () => {
    /*
     * Remove the previous result so the dashboard does not
     * continue showing the old result while the student is
     * taking the assessment again.
     */
    localStorage.removeItem('moneyBasicsQuizResult');

    setCurrentQuestion(0);
    setSelectedAnswer(null);
    setAnswers({});
    setShowResults(false);

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleBackToEducation = () => {
    navigate('/student/education');
  };

  if (showResults) {
    const score = calculateScore();
    const percentage = Math.round((score / totalQuestions) * 100);
    const passed = percentage >= 80;

    return (
      <div className="money-quiz-page">

        <header className="money-quiz-header">
          <div className="money-quiz-header-content">

            <div>
              <p className="money-quiz-eyebrow">
                NILGUARD LEARNING CENTER
              </p>

              <h1>Money Basics & Habits</h1>

              <p className="money-quiz-subtitle">
                Quick Assessment Results
              </p>
            </div>

            <button
              type="button"
              className="money-quiz-back-button"
              onClick={handleBackToEducation}
            >
              ← Education Dashboard
            </button>

          </div>
        </header>

        <main className="money-quiz-content">

          <section className="money-quiz-results-card">

            <div
              className={`money-result-icon ${
                passed ? 'passed' : 'failed'
              }`}
            >
              {passed ? '✓' : '!'}
            </div>

            <span className="money-result-label">
              MODULE 1 ASSESSMENT
            </span>

            <h2>
              {passed
                ? 'Assessment Passed!'
                : 'Keep Practicing'}
            </h2>

            <p className="money-result-message">
              {passed
                ? 'Great job! You demonstrated a strong understanding of the Money Basics & Habits module.'
                : 'Review the lessons and try the assessment again. You need at least 80% to pass.'}
            </p>

            <div className="money-score-circle">
              <strong>{percentage}%</strong>

              <span>
                {score} of {totalQuestions} correct
              </span>
            </div>

            {passed && (
              <p className="money-passed-message">
                ✓ Module 1 has been completed.
              </p>
            )}

            <div className="money-result-actions">

              <button
                type="button"
                className="money-quiz-secondary-button"
                onClick={handleRetake}
              >
                Retake Assessment
              </button>

              <button
                type="button"
                className="money-quiz-primary-button"
                onClick={handleBackToEducation}
              >
                Back to Education →
              </button>

            </div>

          </section>

        </main>
      </div>
    );
  }

  return (
    <div className="money-quiz-page">

      <header className="money-quiz-header">
        <div className="money-quiz-header-content">

          <div>
            <p className="money-quiz-eyebrow">
              NILGUARD LEARNING CENTER
            </p>

            <h1>Money Basics & Habits</h1>

            <p className="money-quiz-subtitle">
              Quick Assessment
            </p>
          </div>

          <button
            type="button"
            className="money-quiz-back-button"
            onClick={handleBackToEducation}
          >
            ← Education Dashboard
          </button>

        </div>
      </header>

      <main className="money-quiz-content">

        <section className="money-quiz-progress-section">

          <div className="money-quiz-progress-top">

            <div>
              <span className="money-quiz-progress-label">
                MODULE 1
              </span>

              <h2>Money Basics Assessment</h2>
            </div>

            <span className="money-quiz-progress-count">
              Question {currentQuestion + 1} of {totalQuestions}
            </span>

          </div>

          <div className="money-quiz-progress-bar">

            <div
              className="money-quiz-progress-fill"
              style={{
                width: `${
                  ((currentQuestion + 1) / totalQuestions) * 100
                }%`
              }}
            />

          </div>

        </section>

        <section className="money-quiz-card">

          <div className="money-question-header">

            <span className="money-question-number">
              QUESTION {currentQuestion + 1}
            </span>

            <h2>{question.question}</h2>

            <p>
              Select the best answer.
            </p>

          </div>

          <div className="money-answer-list">

            {question.options.map((option, index) => {

              const isSelected =
                selectedAnswer === index;

              return (
                <button
                  key={option}
                  type="button"
                  className={`money-answer-option ${
                    isSelected ? 'selected' : ''
                  }`}
                  onClick={() =>
                    handleAnswerSelect(index)
                  }
                >

                  <span className="money-answer-letter">
                    {String.fromCharCode(65 + index)}
                  </span>

                  <span className="money-answer-text">
                    {option}
                  </span>

                  <span className="money-answer-radio">
                    {isSelected ? '✓' : ''}
                  </span>

                </button>
              );
            })}

          </div>

          <div className="money-quiz-navigation">

            <button
              type="button"
              className="money-quiz-secondary-button"
              onClick={handlePrevious}
              disabled={currentQuestion === 0}
            >
              ← Previous
            </button>

            <button
              type="button"
              className="money-quiz-primary-button"
              onClick={handleNext}
              disabled={selectedAnswer === null}
            >
              {currentQuestion === totalQuestions - 1
                ? 'Submit Assessment'
                : 'Next Question →'}
            </button>

          </div>

        </section>

        <section className="money-quiz-info">

          <div>
            <strong>Passing Score: 80%</strong>

            <p>
              Answer all five questions to complete the
              assessment.
            </p>
          </div>

        </section>

      </main>

    </div>
  );
}

export default MoneyBasicsQuizPage;

