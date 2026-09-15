
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/pages/Contracts101.css';

const lessons = [
  {
    title: 'Understanding Contract Terms',
    content: (
      <>
        <p>
          An NIL contract is an agreement that explains what you and a brand
          or other partner have agreed to do. Before signing, you should
          understand the important terms and responsibilities included in the
          agreement.
        </p>

        <h3>Terms to look for</h3>

        <ul>
          <li>
            <strong>Compensation:</strong> How and when you will be paid.
          </li>
          <li>
            <strong>Deliverables:</strong> The posts, appearances, content, or
            other responsibilities you agree to provide.
          </li>
          <li>
            <strong>Deadlines:</strong> When specific responsibilities must be
            completed.
          </li>
          <li>
            <strong>Usage rights:</strong> How the brand can use your name,
            image, likeness, or content.
          </li>
          <li>
            <strong>Term:</strong> How long the agreement remains in effect.
          </li>
        </ul>

        <div className="contracts101-tip">
          <strong>Important:</strong> Do not sign an agreement simply because
          an opportunity looks exciting. Take time to understand what you are
          agreeing to.
        </div>
      </>
    )
  },
  {
    title: 'Identifying Restrictive Clauses',
    content: (
      <>
        <p>
          Some contract terms can limit what you are allowed to do during or
          after an NIL partnership. These restrictions can be especially
          important when you have multiple brand opportunities.
        </p>

        <h3>Examples of restrictions</h3>

        <ul>
          <li>
            <strong>Exclusivity:</strong> May prevent you from working with
            competing brands.
          </li>
          <li>
            <strong>Usage restrictions:</strong> May give a brand specific
            rights to use your name, image, likeness, or content.
          </li>
          <li>
            <strong>Termination terms:</strong> Explain when and how the
            agreement can end.
          </li>
          <li>
            <strong>Morality or conduct clauses:</strong> May address behavior
            that could affect the partnership or the brand's reputation.
          </li>
        </ul>

        <p>
          Pay close attention to restrictions that could affect your other NIL
          partnerships, social media activity, or future opportunities.
        </p>

        <div className="contracts101-tip">
          <strong>Remember:</strong> If you do not understand a restrictive
          clause, ask a qualified professional or your school's appropriate
          NIL/compliance resource before signing.
        </div>
      </>
    )
  },
  {
    title: 'When to Seek Professional Review',
    content: (
      <>
        <p>
          Not every contract is simple. Some agreements may contain terms that
          are difficult to understand or could create important obligations.
          Getting professional guidance can help you understand what you are
          agreeing to before you sign.
        </p>

        <h3>Consider seeking professional review when:</h3>

        <ul>
          <li>The contract contains complicated or unfamiliar language.</li>
          <li>The agreement includes significant restrictions.</li>
          <li>You are unsure about your responsibilities or deadlines.</li>
          <li>The contract includes extensive usage rights.</li>
          <li>You are uncomfortable with any part of the agreement.</li>
          <li>You feel pressured to sign immediately.</li>
        </ul>

        <h3>Who can help?</h3>

        <ul>
          <li>Your school's NIL or compliance office.</li>
          <li>A qualified attorney or other appropriate professional.</li>
          <li>Another qualified resource recommended by your institution.</li>
        </ul>

        <div className="contracts101-tip">
          <strong>Important:</strong> NILGuard provides educational information
          and is not a substitute for legal advice. When you need advice about
          a specific contract, seek guidance from a qualified professional.
        </div>
      </>
    )
  }
];

function Contracts101Page() {
  const navigate = useNavigate();

  const [currentLesson, setCurrentLesson] = useState(0);
  const [completedLessons, setCompletedLessons] = useState([]);

  useEffect(() => {
    const savedProgress = localStorage.getItem('contracts101Progress');

    if (savedProgress) {
      try {
        const progress = JSON.parse(savedProgress);

        setCurrentLesson(progress.currentLesson ?? 0);
        setCompletedLessons(progress.completedLessons ?? []);
      } catch {
        setCurrentLesson(0);
        setCompletedLessons([]);
      }
    }
  }, []);

  const lesson = lessons[currentLesson];

  const saveProgress = (nextLesson, nextCompletedLessons) => {
    const progress = {
      currentLesson: nextLesson,
      completedLessons: nextCompletedLessons
    };

    localStorage.setItem(
      'contracts101Progress',
      JSON.stringify(progress)
    );
  };

  const handleLessonSelect = (index) => {
    setCurrentLesson(index);

    saveProgress(index, completedLessons);

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleNext = () => {
    const updatedCompletedLessons = completedLessons.includes(currentLesson)
      ? completedLessons
      : [...completedLessons, currentLesson];

    setCompletedLessons(updatedCompletedLessons);

    if (currentLesson < lessons.length - 1) {
      const nextLesson = currentLesson + 1;

      setCurrentLesson(nextLesson);

      saveProgress(nextLesson, updatedCompletedLessons);

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });

      return;
    }

    saveProgress(currentLesson, updatedCompletedLessons);

    navigate('/student/education/contracts/quiz');
  };

  const handlePrevious = () => {
    if (currentLesson === 0) return;

    const previousLesson = currentLesson - 1;

    setCurrentLesson(previousLesson);

    saveProgress(previousLesson, completedLessons);

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  return (
    <div className="contracts101-page">
      <header className="contracts101-header">
        <div className="contracts101-header-content">
          <div>
            <p className="contracts101-eyebrow">
              NILGUARD LEARNING CENTER
            </p>

            <h1>Contracts 101</h1>

            <p className="contracts101-subtitle">
              Understand important contract terms, restrictive clauses, and
              when to seek professional review.
            </p>
          </div>

          <button
            type="button"
            className="contracts101-back-button"
            onClick={() => navigate('/student/education')}
          >
            ← Education Dashboard
          </button>
        </div>
      </header>

      <main className="contracts101-content">
        <div className="contracts101-layout">

          <aside className="contracts101-sidebar">
            <div className="contracts101-sidebar-title">
              <span>MODULE 3</span>
              <h2>Contracts 101</h2>
            </div>

            <div className="contracts101-lesson-list">
              {lessons.map((item, index) => {
                const isActive = currentLesson === index;
                const isCompleted = completedLessons.includes(index);

                return (
                  <button
                    key={item.title}
                    type="button"
                    className={`contracts101-lesson-button ${
                      isActive ? 'active' : ''
                    }`}
                    onClick={() => handleLessonSelect(index)}
                  >
                    <span className="contracts101-lesson-number">
                      {isCompleted ? '✓' : index + 1}
                    </span>

                    <span className="contracts101-lesson-title">
                      {item.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="contracts101-lesson-card">
            <div className="contracts101-lesson-header">
              <span>
                LESSON {currentLesson + 1} OF {lessons.length}
              </span>

              <span>
                {Math.round(
                  ((currentLesson + 1) / lessons.length) * 100
                )}%
              </span>
            </div>

            <div className="contracts101-progress-bar">
              <div
                className="contracts101-progress-fill"
                style={{
                  width: `${
                    ((currentLesson + 1) / lessons.length) * 100
                  }%`
                }}
              />
            </div>

            <div className="contracts101-lesson-content">
              <h2>{lesson.title}</h2>

              {lesson.content}
            </div>

            <div className="contracts101-navigation">
              <button
                type="button"
                className="contracts101-secondary-button"
                onClick={handlePrevious}
                disabled={currentLesson === 0}
              >
                ← Previous
              </button>

              <button
                type="button"
                className="contracts101-primary-button"
                onClick={handleNext}
              >
                {currentLesson === lessons.length - 1
                  ? 'Take Quick Assessment →'
                  : 'Next Lesson →'}
              </button>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}

export default Contracts101Page;

