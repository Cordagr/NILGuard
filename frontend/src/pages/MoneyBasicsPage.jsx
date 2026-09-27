``
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/pages/MoneyBasics.css';

const lessons = [
  {
    number: 1,
    title: 'Understanding Cash Flow',
    shortTitle: 'Cash Flow',
    content: (
      <>
        <p>
          Cash flow is the amount of money coming into and going out of your
          account during a specific period of time.
        </p>

        <div className="money-definition-box">
          <strong>Simple formula</strong>
          <span>Income − Expenses = Remaining Cash Flow</span>
        </div>

        <h3>Money coming in</h3>

        <p>
          Your income can come from several different sources. For a
          student-athlete, this could include NIL compensation, employment,
          scholarships or other legitimate sources of income.
        </p>

        <h3>Money going out</h3>

        <p>
          Expenses are the things you spend money on. Common examples include
          housing, food, transportation, phone bills, entertainment, and
          personal purchases.
        </p>

        <div className="money-example-card">
          <h4>Example: Monthly Cash Flow</h4>

          <div className="money-example-row income">
            <span>NIL income</span>
            <strong>$1,500</strong>
          </div>

          <div className="money-example-row income">
            <span>Part-time job</span>
            <strong>$800</strong>
          </div>

          <div className="money-example-total">
            <span>Total income</span>
            <strong>$2,300</strong>
          </div>

          <div className="money-example-row expense">
            <span>Housing</span>
            <strong>$900</strong>
          </div>

          <div className="money-example-row expense">
            <span>Food</span>
            <strong>$300</strong>
          </div>

          <div className="money-example-row expense">
            <span>Transportation</span>
            <strong>$150</strong>
          </div>

          <div className="money-example-row expense">
            <span>Phone</span>
            <strong>$75</strong>
          </div>

          <div className="money-example-row expense">
            <span>Entertainment</span>
            <strong>$125</strong>
          </div>

          <div className="money-example-total">
            <span>Total expenses</span>
            <strong>$1,550</strong>
          </div>

          <div className="money-example-result">
            <span>Remaining cash flow</span>
            <strong>$750</strong>
          </div>
        </div>

        <div className="money-tip">
          <strong>Good habit:</strong>
          <span>
            Track your income and expenses regularly so you know where your
            money is going before you make large purchases.
          </span>
        </div>
      </>
    )
  },

  {
    number: 2,
    title: 'Understanding Sources of Income',
    shortTitle: 'Sources of Income',
    content: (
      <>
        <p>
          Understanding where your money comes from is an important part of
          managing your finances. Student-athletes may have several different
          sources of income.
        </p>

        <div className="income-source-grid">
          <div className="income-source-card">
            <div className="income-source-icon">NIL</div>
            <h3>NIL Compensation</h3>
            <p>
              Money earned through activities involving your name, image, and
              likeness.
            </p>
          </div>

          <div className="income-source-card">
            <div className="income-source-icon">$</div>
            <h3>Employment</h3>
            <p>
              Income earned from a part-time or full-time job outside of your
              athletic activities.
            </p>
          </div>

          <div className="income-source-card">
            <div className="income-source-icon">S</div>
            <h3>Scholarships & Support</h3>
            <p>
              Financial support associated with your education or athletic
              participation.
            </p>
          </div>

          <div className="income-source-card">
            <div className="income-source-icon">+</div>
            <h3>Other Income</h3>
            <p>
              Other legitimate income sources such as appearance fees,
              affiliate income, or creator income.
            </p>
          </div>
        </div>

        <h3>Gross income vs. available money</h3>

        <p>
          The amount listed on an agreement is not always the same as the
          amount you can immediately spend. Depending on the situation, taxes,
          fees, or other obligations may affect the amount of money available
          to you.
        </p>

        <div className="money-definition-box">
          <strong>Remember</strong>
          <span>
            Before spending income from an NIL opportunity, understand the
            payment terms and consider what obligations may apply.
          </span>
        </div>

        <div className="money-tip">
          <strong>Good habit:</strong>
          <span>
            Keep records of your income sources and payments so you can compare
            your expected income with what you actually receive.
          </span>
        </div>
      </>
    )
  },

  {
    number: 3,
    title: 'Building a Personal Budget',
    shortTitle: 'Build a Budget',
    content: (
      <>
        <p>
          A budget is a plan for how you will use your money. Creating a budget
          before spending your income can help you make better financial
          decisions.
        </p>

        <div className="budget-flow">
          <div className="budget-flow-step">
            <span>1</span>
            <strong>Income</strong>
            <small>Know what is coming in</small>
          </div>

          <div className="budget-arrow">→</div>

          <div className="budget-flow-step">
            <span>2</span>
            <strong>Essentials</strong>
            <small>Cover important expenses</small>
          </div>

          <div className="budget-arrow">→</div>

          <div className="budget-flow-step">
            <span>3</span>
            <strong>Savings</strong>
            <small>Set money aside</small>
          </div>

          <div className="budget-arrow">→</div>

          <div className="budget-flow-step">
            <span>4</span>
            <strong>Spending</strong>
            <small>Use remaining money intentionally</small>
          </div>
        </div>

        <h3>A simple budget example</h3>

        <div className="budget-example">
          <div className="budget-example-header">
            <span>Monthly income</span>
            <strong>$2,300</strong>
          </div>

          <div className="budget-category">
            <div>
              <strong>Essential expenses</strong>
              <span>Housing, food, transportation, phone</span>
            </div>
            <strong>$1,425</strong>
          </div>

          <div className="budget-category">
            <div>
              <strong>Savings</strong>
              <span>Emergency fund or future expenses</span>
            </div>
            <strong>$400</strong>
          </div>

          <div className="budget-category">
            <div>
              <strong>Discretionary spending</strong>
              <span>Entertainment and non-essential purchases</span>
            </div>
            <strong>$300</strong>
          </div>

          <div className="budget-category">
            <div>
              <strong>Remaining</strong>
              <span>Money available for unexpected expenses</span>
            </div>
            <strong>$175</strong>
          </div>
        </div>

        <h3>Before making a large purchase</h3>

        <div className="budget-checklist">
          <div>
            <span className="checkmark">✓</span>
            <span>Do I have enough money for my essential expenses?</span>
          </div>

          <div>
            <span className="checkmark">✓</span>
            <span>Have I set aside money for savings?</span>
          </div>

          <div>
            <span className="checkmark">✓</span>
            <span>Do I understand my upcoming financial obligations?</span>
          </div>

          <div>
            <span className="checkmark">✓</span>
            <span>Is this purchase part of my spending plan?</span>
          </div>
        </div>

        <div className="money-tip">
          <strong>Good habit:</strong>
          <span>
            Review your budget regularly and update it when your income or
            expenses change.
          </span>
        </div>
      </>
    )
  }
];

function MoneyBasicsPage() {
  const navigate = useNavigate();

  const [currentLesson, setCurrentLesson] = useState(() => {
    const savedProgress = localStorage.getItem('moneyBasicsProgress');

    if (savedProgress) {
      try {
        const progress = JSON.parse(savedProgress);

        if (
          typeof progress.currentLesson === 'number' &&
          progress.currentLesson >= 0 &&
          progress.currentLesson < lessons.length
        ) {
          return progress.currentLesson;
        }
      } catch (error) {
        console.error('Could not load saved progress:', error);
      }
    }

    return 0;
  });

  const [completedLessons, setCompletedLessons] = useState(() => {
    const savedProgress = localStorage.getItem('moneyBasicsProgress');

    if (savedProgress) {
      try {
        const progress = JSON.parse(savedProgress);

        if (Array.isArray(progress.completedLessons)) {
          return progress.completedLessons;
        }
      } catch (error) {
        console.error('Could not load completed lessons:', error);
      }
    }

    return [];
  });

  /*
   * Save progress whenever the current lesson or completed lessons change.
   */
  useEffect(() => {
    const progress = {
      currentLesson,
      completedLessons
    };

    localStorage.setItem(
      'moneyBasicsProgress',
      JSON.stringify(progress)
    );
  }, [currentLesson, completedLessons]);

  const lesson = lessons[currentLesson];

  const isFirstLesson = currentLesson === 0;
  const isLastLesson = currentLesson === lessons.length - 1;

  /*
   * Mark the current lesson as completed.
   */
  const markLessonCompleted = (lessonIndex) => {
    setCompletedLessons((previous) => {
      if (previous.includes(lessonIndex)) {
        return previous;
      }

      return [...previous, lessonIndex].sort((a, b) => a - b);
    });
  };

  const handlePrevious = () => {
    if (!isFirstLesson) {
      setCurrentLesson((previous) => previous - 1);

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  const handleNext = () => {
    if (!isLastLesson) {
      /*
       * Mark the current lesson as completed before moving forward.
       */
      markLessonCompleted(currentLesson);

      setCurrentLesson((previous) => previous + 1);

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  const handleLessonSelect = (index) => {
    setCurrentLesson(index);

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleBackToEducation = () => {
    navigate('/student/education');
  };

  const progressPercentage =
    (completedLessons.length / lessons.length) * 100;

  return (
    <div className="money-basics-page">

      <header className="money-basics-header">
        <div className="money-basics-header-content">

          <div>
            <p className="money-basics-eyebrow">
              NILGUARD LEARNING CENTER
            </p>

            <h1>Money Basics & Habits</h1>

            <p className="money-basics-subtitle">
              Learn practical strategies for managing income, tracking
              expenses, and building a personal budget.
            </p>
          </div>

          <button
            type="button"
            className="money-back-button"
            onClick={handleBackToEducation}
          >
            ← Education Dashboard
          </button>

        </div>
      </header>

      <main className="money-basics-content">

        <section className="money-progress-section">

          <div className="money-progress-top">

            <div>
              <span className="money-progress-label">
                MODULE 1
              </span>

              <h2>
                {lesson.number}. {lesson.title}
              </h2>
            </div>

            <span className="money-progress-count">
              Lesson {currentLesson + 1} of {lessons.length}
            </span>

          </div>

          <div className="money-progress-bar">
            <div
              className="money-progress-fill"
              style={{
                width: `${((currentLesson + 1) / lessons.length) * 100}%`
              }}
            />
          </div>

          <p className="money-completion-text">
            {completedLessons.length} of {lessons.length} lessons completed
          </p>

        </section>

        <section className="money-lesson-layout">

          <aside className="money-lesson-sidebar">

            <h3>Module Lessons</h3>

            <div className="money-lesson-list">

              {lessons.map((item, index) => (
                <button
                  key={item.number}
                  type="button"
                  className={`money-lesson-nav ${
                    index === currentLesson ? 'active' : ''
                  } ${
                    completedLessons.includes(index)
                      ? 'completed'
                      : ''
                  }`}
                  onClick={() => handleLessonSelect(index)}
                >
                  <span className="money-lesson-number">
                    {completedLessons.includes(index)
                      ? '✓'
                      : item.number}
                  </span>

                  <span>
                    {item.shortTitle}
                  </span>
                </button>
              ))}

            </div>

          </aside>

          <article className="money-lesson-card">

            <div className="money-lesson-card-header">

              <span className="money-lesson-badge">
                LESSON {lesson.number}
              </span>

              <h2>{lesson.title}</h2>

            </div>

            <div className="money-lesson-body">
              {lesson.content}
            </div>

            <div className="money-lesson-navigation">

              <button
                type="button"
                className="money-secondary-button"
                onClick={handlePrevious}
                disabled={isFirstLesson}
              >
                ← Previous
              </button>

              {!isLastLesson ? (
                <button
                  type="button"
                  className="money-primary-button"
                  onClick={handleNext}
                >
                  Next Lesson →
                </button>
              ) : (
               <button
  type="button"
  className="money-primary-button"
  onClick={() => {
    markLessonCompleted(currentLesson);
    navigate('/student/education/money-basics/quiz');
  }}
>
  Take Quick Assessment →
</button> 
              )}

            </div>

          </article>

        </section>

        <section className="money-module-footer">

          <div>
            <span className="money-footer-label">
              MODULE 1
            </span>

            <h2>Money Basics & Habits</h2>

            <p>
              Complete all three lessons to prepare for the quick assessment.
            </p>
          </div>

          <button
            type="button"
            className="money-secondary-button"
            onClick={handleBackToEducation}
          >
            Back to Education
          </button>

        </section>

      </main>
    </div>
  );
}

export default MoneyBasicsPage;

