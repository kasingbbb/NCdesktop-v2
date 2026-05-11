import React from 'react';

const scenarios = [
  {
    icon: '🎓',
    persona: 'Student / Lifelong Learner',
    tagline: 'One-click lecture citations · 10× faster project references',
    pain: 'Professor hits a brilliant derivation mid-lecture — you grab your phone, unlock, open the app, hit record, switch to camera for the slide... by then, the slide has moved on.',
    solution: 'One press in 0.5s — audio and photo capture simultaneously. Every photo is time-anchored to the recording. Review later: tap the photo, hear exactly what was said.',
    image: '/images/classroom.png',
  },
  {
    icon: '💼',
    persona: 'Professional',
    tagline: 'One-click meeting notes · 10× faster weekly reports',
    pain: '5 meetings a week, pages of notes — and when the weekly report is due, your mind goes blank. Recordings in one app, photos scattered among selfies in your camera roll.',
    solution: 'By the time you\'re back at your desk, the folder is already named, sorted, and summarized. Drag it into AI, get your weekly report draft in 10 seconds.',
    image: '/images/workplace.png',
  },
  {
    icon: '✍️',
    persona: 'Content Creator / Researcher',
    tagline: 'One-click research library · 7-day deadline, all-in on creating',
    pain: '7 days until the deadline — spend 5 hunting for materials across devices, leaving only 2 days to actually write. Ideas scattered everywhere, impossible to find when you need them.',
    solution: 'An entire semester\'s knowledge already digested. Open the topic folder, drop it into AI, get the outline in 10 minutes. All 7 days go toward writing.',
    image: '/images/creator.png',
  }
];

const PainPoints = () => (
  <section className="pain-section container">
    <div className="section-header animate-fade-in">
      <h2 className="section-title">Ever had <span className="text-accent">one of these moments</span>?</h2>
      <p className="section-subtitle">It's not a willpower problem — there's just no good system for pulling your knowledge together.</p>
    </div>

    <div className="pain-grid">
      {scenarios.map((s, i) => (
        <div key={i} className="pain-card animate-fade-in" style={{ animationDelay: `${i * 0.12}s` }}>
          <div className="pain-card-left">
            <div className="pain-card-header">
              <div className="pain-icon">{s.icon}</div>
              <div>
                <div className="pain-persona">{s.persona}</div>
                <div className="pain-tagline">{s.tagline}</div>
              </div>
            </div>
            <div className="pain-content">
              <div className="pain-problem">
                <div className="pain-label">The Problem</div>
                <p>{s.pain}</p>
              </div>
              <div className="pain-arrow">→</div>
              <div className="pain-solution">
                <div className="pain-label">With NoteCapt</div>
                <p>{s.solution}</p>
              </div>
            </div>
          </div>
          <div className="pain-image">
            <img src={s.image} alt={s.persona} />
          </div>
        </div>
      ))}
    </div>

    <style>{`
      .pain-section { padding: var(--section-padding); }
      .pain-grid { display: grid; gap: 20px; margin-top: 48px; }

      .pain-card {
        padding: 32px 36px;
        border-radius: var(--radius-card);
        display: grid;
        grid-template-columns: 1fr 340px;
        gap: 32px;
        align-items: center;
        border: 0.5px solid var(--border-light);
        background: rgba(255,255,255,0.02);
        transition: var(--transition-smooth);
      }
      .pain-card:hover { border-color: var(--border-accent); }

      .pain-card-left {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      .pain-image {
        border-radius: var(--radius-img);
        overflow: hidden;
        background: rgba(0,0,0,0.1);
        align-self: stretch;
      }
      .pain-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        min-height: 200px;
      }

      .pain-card-header {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .pain-icon {
        font-size: 2rem;
        width: 56px; height: 56px;
        display: flex; align-items: center; justify-content: center;
        background: var(--accent-dim);
        border: 0.5px solid var(--border-accent);
        border-radius: 14px;
      }
      .pain-persona {
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-main);
      }
      .pain-tagline {
        font-size: 0.85rem;
        color: var(--accent);
        font-weight: 700;
        line-height: 1.5;
        margin-top: 4px;
        background: var(--accent-dim);
        border-radius: 6px;
        padding: 3px 8px;
        display: inline-block;
      }

      .pain-content {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 20px;
        align-items: center;
      }
      .pain-label {
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--accent);
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-family: 'IBM Plex Mono', monospace;
      }
      .pain-problem {
        padding: 16px 20px;
        border-radius: 12px;
        border-left: 2px solid rgba(255,80,80,0.4);
        background: rgba(255,80,80,0.04);
      }
      .pain-problem p {
        font-size: 0.875rem;
        line-height: 1.65;
        color: var(--text-muted);
      }
      .pain-arrow {
        font-size: 1.2rem;
        color: var(--accent);
        font-weight: 600;
      }
      .pain-solution {
        padding: 16px 20px;
        border-radius: 12px;
        border-left: 2px solid var(--border-accent);
        background: var(--accent-dim);
      }
      .pain-solution p {
        font-size: 0.875rem;
        line-height: 1.65;
        color: var(--text-main);
        font-weight: 500;
      }

      @media (max-width: 992px) {
        .pain-card { grid-template-columns: 1fr; }
        .pain-content { grid-template-columns: 1fr; gap: 12px; }
        .pain-arrow { transform: rotate(90deg); justify-self: center; }
        .pain-image img { min-height: 180px; }
      }
    `}</style>
  </section>
);

export default PainPoints;
