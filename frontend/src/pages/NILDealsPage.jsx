
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/pages/NILDeals.css';

const lessons = [
  {
    title: 'Brand Outreach',
    subtitle: 'Building professional relationships with potential NIL partners',
    content: (
      <>
        <p>
          Brand outreach is the process of identifying companies that may
          be interested in working with you and introducing yourself in a
          professional way.
        </p>

        <h3>Finding the Right Brands</h3>

        <p>
          Start with brands that make sense for your audience, interests,
          sport, and personal image. A strong partnership should feel
          natural rather than forced.
        </p>

        <ul>
          <li>Local businesses in your community</li>
          <li>Sports and fitness brands</li>
          <li>Clothing and apparel companies</li>
          <li>Food and nutrition companies</li>
          <li>Technology and lifestyle brands</li>
        </ul>

        <h3>Creating a Professional Pitch</h3>

        <p>
          Your initial message should be short, professional, and focused
          on the value you can provide to the brand.
        </p>

        <div className="nil-example-box">
          <strong>A strong outreach message can include:</strong>

          <ul>
            <li>Your name and school</li>
            <li>Your sport or area of involvement</li>
            <li>Why you are interested in the brand</li>
            <li>Your audience or social presence</li>
            <li>A simple idea for a potential partnership</li>
            <li>Your contact information</li>
          </ul>
        </div>

        <h3>Professional Communication</h3>

        <p>
          Treat brand communication like a professional business
          relationship. Use appropriate language, respond in a reasonable
          amount of time, and keep records of important conversations.
        </p>
      </>
    )
  },
  {
    title: 'Evaluating NIL Offers',
    subtitle: 'Understanding what to look for before accepting an opportunity',
    content: (
      <>
        <p>
          Not every NIL opportunity is a good opportunity. Before
          accepting an offer, review what the brand is offering and what
          you are expected to provide in return.
        </p>

        <h3>Compensation</h3>

        <p>
          Determine exactly how you will be compensated. Compensation may
          include money, products, services, or a combination of benefits.
        </p>

        <h3>Deliverables</h3>

        <p>
          Deliverables are the specific things you agree to provide for
          the brand.
        </p>

        <ul>
          <li>Social media posts</li>
          <li>Videos or promotional content</li>
          <li>Appearances or events</li>
          <li>Product promotion</li>
          <li>Other promotional activities</li>
        </ul>

        <h3>Important Terms to Review</h3>

        <div className="nil-info-grid">
          <div className="nil-info-item">
            <strong>Exclusivity</strong>
            <p>
              Check whether you are restricted from working with competing
              brands.
            </p>
          </div>

          <div className="nil-info-item">
            <strong>Usage Rights</strong>
            <p>
              Understand how and where the brand can use your name,
              image, or content.
            </p>
          </div>

          <div className="nil-info-item">
            <strong>Deadlines</strong>
            <p>
              Make sure you understand when required content or
              appearances must be completed.
            </p>
          </div>

          <div className="nil-info-item">
            <strong>Termination</strong>
            <p>
              Review what happens if either side wants to end the
              agreement.
            </p>
          </div>
        </div>

        <div className="nil-warning-box">
          <strong>Watch for red flags</strong>

          <p>
            Be cautious when an opportunity has unclear payment terms,
            unusually broad requirements, pressure to sign immediately,
            or obligations you do not fully understand.
          </p>
        </div>
      </>
    )
  },
  {
    title: 'Managing Endorsements',
    subtitle: 'Fulfilling your responsibilities and maintaining professional relationships',
    content: (
      <>
        <p>
          Accepting an NIL opportunity is only the beginning of the
          partnership. Managing the relationship professionally helps you
          protect your reputation and build long-term opportunities.
        </p>

        <h3>Complete Your Deliverables</h3>

        <p>
          Keep track of every requirement you agreed to complete. Missing
          deadlines or failing to provide promised content can damage your
          relationship with a brand.
        </p>

        <ul>
          <li>Record required posts and appearances</li>
          <li>Track deadlines</li>
          <li>Save important communications</li>
          <li>Confirm completed deliverables</li>
        </ul>

        <h3>Communicate With the Brand</h3>

        <p>
          Communication is especially important if circumstances change.
          If you are unable to meet a deadline or have questions about a
          requirement, contact the appropriate person as soon as possible.
        </p>

        <h3>Protect Your Professional Reputation</h3>

        <p>
          Your NIL activities can become part of your professional
          reputation. Make sure sponsored content and public
          communications are consistent with your values and obligations.
        </p>

        <div className="nil-checklist-box">
          <strong>Before completing an endorsement, ask yourself:</strong>

          <ul>
            <li>Do I understand what I agreed to do?</li>
            <li>Have I completed all required deliverables?</li>
            <li>Did I meet the agreed deadlines?</li>
            <li>Did I communicate professionally?</li>
            <li>Did I keep records of the partnership?</li>
          </ul>
        </div>

        <h3>When You Need Help</h3>

        <p>
          If you are unsure about an important obligation, payment term,
          or contract requirement, do not guess. Consider asking your
          university's appropriate NIL or compliance office or another
          qualified professional for guidance.
        </p>
      </>
    )
  }
];

function NILDealsPage() {
  const navigate = useNavigate();

  const [currentLesson, setCurrentLesson] = useState(() => {
    const savedProgress = localStorage.getItem('nilDealsProgress');

    if (savedProgress) {
      try {
        const parsed = JSON.parse(savedProgress);
        return parsed.currentLesson ?? 0;
      } catch {
        return 0;
      }
    }

    return 0;
  });

  const [completedLessons, setCompletedLessons] = useState(() => {
    const savedProgress = localStorage.getItem('nilDealsProgress');

    if (savedProgress) {
      try {
        const parsed = JSON.parse(savedProgress);
        return parsed.completedLessons ?? [];
      } catch {
        return [];
      }
    }

    return [];
  });

  useEffect(() => {
    const progress = {
      currentLesson,
      completedLessons
    };

    localStorage.setItem(
      'nilDealsProgress',
      JSON.stringify(progress)
    );
  }, [currentLesson, completedLessons]);

  const markLessonCompleted = (lessonIndex) => {
    setCompletedLessons((previous) => {
      if (previous.includes(lessonIndex)) {
        return previous;
      }

      return [...previous, lessonIndex].sort(
        (a, b) => a - b
      );
    });
  };

  const handleNext = () => {
    markLessonCompleted(currentLesson);

    if (currentLesson < lessons.length - 1) {
      setCurrentLesson(currentLesson + 1);

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } else {
      navigate('/student/education/nil-deals/quiz');
    }
  };

  const handlePrevious = () => {
    if (currentLesson === 0) {
      return;
    }

    setCurrentLesson(currentLesson - 1);

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleLessonSelect = (lessonIndex) => {
    setCurrentLesson(lessonIndex);

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleBackToEducation = () => {
    navigate('/student/education');
  };

  const lesson = lessons[currentLesson];

  return (
    <div className="nil-deals-page">

      <header className="nil-deals-header">
        <div className="nil-deals-header-content">

          <div>
            <p className="nil-deals-eyebrow">
              NILGUARD LEARNING CENTER
            </p>

            <h1>NIL Deal Basics & Partnerships</h1>

            <p className="nil-deals-subtitle">
              Learn how to find, evaluate, and manage NIL
              opportunities.
            </p>
          </div>

          <button
            type="button"
            className="nil-deals-back-button"
            onClick={handleBackToEducation}
          >
            ← Education Dashboard
          </button>

        </div>
      </header>

      <main className="nil-deals-content">

        <section className="nil-deals-progress-section">

          <div className="nil-deals-progress-top">

            <div>
              <span className="nil-deals-progress-label">
                MODULE 2
              </span>

              <h2>
                {lesson.title}
              </h2>
            </div>

            <span className="nil-deals-progress-count">
              Lesson {currentLesson + 1} of {lessons.length}
            </span>

          </div>

          <div className="nil-deals-progress-bar">

            <div
              className="nil-deals-progress-fill"
              style={{
                width: `${
                  ((currentLesson + 1) /
                    lessons.length) *
                  100
                }%`
              }}
            />

          </div>

          <p className="nil-deals-completion-text">
            {completedLessons.length} of {lessons.length}{' '}
            lessons completed
          </p>

        </section>

        <div className="nil-deals-layout">

          <aside className="nil-deals-sidebar">

            <div className="nil-deals-sidebar-header">
              <span>MODULE 2</span>
              <strong>Your Lessons</strong>
            </div>

            <div className="nil-deals-lesson-list">

              {lessons.map((item, index) => {

                const isActive =
                  currentLesson === index;

                const isCompleted =
                  completedLessons.includes(index);

                return (
                  <button
                    key={item.title}
                    type="button"
                    className={`nil-deals-lesson-item ${
                      isActive ? 'active' : ''
                    }`}
                    onClick={() =>
                      handleLessonSelect(index)
                    }
                  >

                    <span
                      className={`nil-deals-lesson-number ${
                        isCompleted ? 'completed' : ''
                      }`}
                    >
                      {isCompleted
                        ? '✓'
                        : index + 1}
                    </span>

                    <span className="nil-deals-lesson-info">

                      <strong>
                        {item.title}
                      </strong>

                      <small>
                        {isCompleted
                          ? 'Completed'
                          : index === currentLesson
                            ? 'In Progress'
                            : 'Not Started'}
                      </small>

                    </span>

                  </button>
                );
              })}

            </div>

          </aside>

          <section className="nil-deals-lesson-card">

            <div className="nil-deals-lesson-heading">

              <span className="nil-deals-lesson-label">
                LESSON {currentLesson + 1}
              </span>

              <h2>{lesson.title}</h2>

              <p>{lesson.subtitle}</p>

            </div>

            <div className="nil-deals-lesson-content">
              {lesson.content}
            </div>

            <div className="nil-deals-navigation">

              <button
                type="button"
                className="nil-deals-secondary-button"
                onClick={handlePrevious}
                disabled={currentLesson === 0}
              >
                ← Previous
              </button>

              <button
                type="button"
                className="nil-deals-primary-button"
                onClick={handleNext}
              >
                {currentLesson === lessons.length - 1
                  ? 'Take Quick Assessment →'
                  : 'Complete & Continue →'}
              </button>

            </div>

          </section>

        </div>

      </main>

    </div>
  );
}

export default NILDealsPage;

