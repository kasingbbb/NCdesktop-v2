import React from 'react';

const comparisons = [
  {
    before: 'Record on phone → forget to organize → never listen again',
    after: 'Auto-transcribed and tagged — searchable any time',
    icon: '🎙️'
  },
  {
    before: 'Photo notes → buried in camera roll → impossible to find',
    after: 'Photos anchored to audio timeline — full context preserved',
    icon: '📸'
  },
  {
    before: 'Multiple note apps → information silos → chaotic assembly',
    after: 'Unified library — one-click export to any AI tool',
    icon: '🔗'
  },
  {
    before: '7-day deadline → 5 days hunting materials → 2 days to write',
    after: 'Knowledge already digested → all 7 days go to writing',
    icon: '⏰'
  }
];

const Comparison = () => (
  <section className="comparison-section container">
    {/* Top: Title left + Image right */}
    <div className="comparison-hero animate-fade-in">
      <div className="comparison-hero-text">
        <h2 className="comparison-main-title">The Old Way vs <span className="text-accent">NoteCapt</span></h2>
        <p className="comparison-main-subtitle">See where the gap really is — four everyday moments where the old workflow leaks knowledge.</p>
      </div>
      <div className="comparison-hero-image">
        <img src="/images/comparison.png" alt="The old way vs NoteCapt" />
      </div>
    </div>

    {/* Bottom: 2×2 grid of comparison cards */}
    <div className="comparison-grid">
      {comparisons.map((c, i) => (
        <div key={i} className="comparison-card animate-fade-in" style={{ animationDelay: `${i * 0.08}s` }}>
          <div className="comparison-card-inner">
            <div className="comparison-icon">{c.icon}</div>
            <div className="comparison-before">
              <div className="comparison-label">Before</div>
              <p>{c.before}</p>
            </div>
            <div className="comparison-arrow">→</div>
            <div className="comparison-after">
              <div className="comparison-label">With NoteCapt</div>
              <p>{c.after}</p>
            </div>
          </div>
        </div>
      ))}
    </div>

    <style>{`
      .comparison-section { padding: var(--section-padding); }

      /* Top hero: title left + image right */
      .comparison-hero {
        display: grid;
        grid-template-columns: 1fr 1.2fr;
        gap: 48px;
        align-items: center;
        margin-bottom: 40px;
      }
      .comparison-hero-text {}
      .comparison-main-title {
        font-size: 3rem;
        font-weight: 700;
        line-height: 1.15;
        margin-bottom: 16px;
      }
      .comparison-main-subtitle {
        font-size: 1.05rem;
        color: var(--text-muted);
        line-height: 1.7;
      }
      .comparison-hero-image {
        border-radius: var(--radius-card);
        overflow: hidden;
        border: 0.5px solid var(--border-light);
        background: rgba(0,0,0,0.1);
      }
      .comparison-hero-image img {
        width: 100%;
        height: auto;
        display: block;
      }

      /* Bottom: 2×2 card grid */
      .comparison-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }

      .comparison-card {
        padding: 24px 28px;
        border-radius: var(--radius-img);
        border: 0.5px solid var(--border-light);
        background: rgba(255,255,255,0.02);
        transition: var(--transition-smooth);
      }
      .comparison-card:hover { border-color: var(--border-accent); }

      .comparison-card-inner {
        display: grid;
        grid-template-columns: auto 1fr auto 1fr;
        gap: 16px;
        align-items: center;
      }

      .comparison-icon { font-size: 1.4rem; }
      .comparison-label {
        font-size: 0.72rem;
        font-weight: 600;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-family: 'IBM Plex Mono', monospace;
        color: var(--text-muted);
      }
      .comparison-before p {
        font-size: 0.85rem;
        color: var(--text-muted);
        line-height: 1.5;
      }
      .comparison-arrow {
        font-size: 1rem;
        color: var(--accent);
        font-weight: 600;
      }
      .comparison-after .comparison-label { color: var(--accent); }
      .comparison-after p {
        font-size: 0.85rem;
        color: var(--text-main);
        font-weight: 600;
        line-height: 1.5;
      }

      @media (max-width: 992px) {
        .comparison-hero { grid-template-columns: 1fr; gap: 32px; }
        .comparison-grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 768px) {
        .comparison-main-title { font-size: 2rem; }
        .comparison-card-inner { grid-template-columns: 1fr; gap: 10px; }
        .comparison-icon { justify-self: center; }
        .comparison-arrow { transform: rotate(90deg); justify-self: center; }
      }
    `}</style>
  </section>
);

export default Comparison;
