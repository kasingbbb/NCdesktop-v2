import React from 'react';

const Hero = () => (
  <section className="hero-section">
    <div className="container hero-inner">
      {/* Left: Copy */}
      <div className="hero-copy animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <div className="hero-badge">Raise your own Knowledge Lobster</div>
        <h1 className="hero-title">
          Lecture recordings buried in your phone?<br />
          Meeting notes shot and<span className="text-underline-accent"> never opened again</span>?
        </h1>
        <p className="hero-subtitle">
          It's not that you're not trying — there's just no good way to pull everything you learn into one place.
          NoteCapt turns every class, every meeting into a reusable knowledge asset. Like raising a lobster that grows with you: the more you feed it, the smarter it gets.
        </p>

        <div className="hero-metrics">
          <div className="hero-metric">
            <span className="hero-metric-value mono">0.5s</span>
            <span className="hero-metric-label">Capture Latency</span>
          </div>
          <div className="hero-metric-divider" />
          <div className="hero-metric">
            <span className="hero-metric-value mono">15m</span>
            <span className="hero-metric-label">Directional Range</span>
          </div>
          <div className="hero-metric-divider" />
          <div className="hero-metric">
            <span className="hero-metric-value mono">10×10</span>
            <span className="hero-metric-label">Efficiency · GPA</span>
          </div>
        </div>

        <div className="hero-actions">
          <a href="#" className="btn-primary">Try Free for 14 Days</a>
          <a href="#loops" className="btn-secondary">Watch 3-min Demo</a>
        </div>
        <div className="hero-trust">
          <span>No credit card</span>
          <span className="hero-trust-dot" />
          <span>Cancel anytime</span>
          <span className="hero-trust-dot" />
          <span>Your data stays private</span>
        </div>
      </div>

      {/* Right: Mockup + placeholder image */}
      <div className="hero-visual animate-fade-in" style={{ animationDelay: '0.4s' }}>
        <div className="hero-visual-inner">
        <div className="mockup">
          <div className="mockup-bar">
            <div className="mockup-dots"><span /><span /><span /></div>
            <span className="mockup-title">Your Personal Knowledge Network</span>
          </div>
          <div className="mockup-body">
            <div className="capture-zone">
              <div className="capture-ring" />
              <span className="capture-label">Capture Anything</span>
              <small>Voice · Photo · Text</small>
            </div>
            <div className="asset-list">
              <div className="asset-row">
                <span className="asset-icon">🎓</span>
                <div>
                  <strong>Meeting Insight</strong>
                  <small>Auto-tagged · Transcribed</small>
                </div>
              </div>
              <div className="asset-row">
                <span className="asset-icon">💡</span>
                <div>
                  <strong>Research Note</strong>
                  <small>Semantic Aligned</small>
                </div>
              </div>
              <div className="asset-row">
                <span className="asset-icon">✨</span>
                <div>
                  <strong>Learning Resource</strong>
                  <small>Ready for LLM</small>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Placeholder image — replace with real asset */}
        <div className="hero-placeholder-img">
          <span className="hero-placeholder-label">Image · 560 × 220 px</span>
        </div>
        </div>
      </div>
    </div>

    <style>{`
      .hero-section {
        padding: 152px 0 80px;
        background: var(--bg-dark);
      }
      .hero-inner {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 64px;
        align-items: start;
      }

      .hero-badge {
        display: inline-block;
        padding: 6px 14px;
        border-radius: var(--radius-btn);
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--accent);
        border: 0.5px solid var(--border-accent);
        background: var(--accent-dim);
        margin-bottom: 24px;
        letter-spacing: 0.5px;
      }

      .hero-title {
        font-size: 3.2rem;
        line-height: 1.15;
        margin-bottom: 20px;
        font-weight: 700;
      }
      .hero-subtitle {
        font-size: 1rem;
        color: var(--text-muted);
        line-height: 1.75;
        margin-bottom: 36px;
      }

      .hero-metrics {
        display: flex;
        align-items: center;
        gap: 24px;
        margin-bottom: 36px;
        padding: 20px 24px;
        border: 0.5px solid var(--border-light);
        border-radius: var(--radius-img);
        background: rgba(255,255,255,0.02);
      }
      .hero-metric { text-align: left; }
      .hero-metric-value {
        display: block;
        font-size: 1.6rem;
        font-weight: 600;
        color: var(--accent);
        line-height: 1;
        margin-bottom: 4px;
      }
      .hero-metric-label {
        display: block;
        font-size: 0.78rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .hero-metric-divider {
        width: 0.5px;
        height: 36px;
        background: var(--border-light);
        flex-shrink: 0;
      }

      .hero-actions {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
      }
      .hero-trust {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 0.75rem;
        color: var(--text-muted);
      }
      .hero-trust-dot {
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: var(--border-mid);
      }

      .hero-visual-inner {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .hero-placeholder-img {
        border-radius: var(--radius-img);
        border: 1px dashed var(--border-accent);
        background: rgba(100, 220, 180, 0.04);
        height: 220px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .hero-placeholder-label {
        font-size: 0.78rem;
        font-family: 'IBM Plex Mono', monospace;
        color: var(--accent);
        opacity: 0.6;
        letter-spacing: 0.5px;
      }

      .mockup {
        border-radius: var(--radius-card);
        border: 0.5px solid var(--border-light);
        background: var(--bg-card);
        overflow: hidden;
        animation: heroFloat 7s ease-in-out infinite;
      }
      .mockup-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border-bottom: 0.5px solid var(--border-light);
      }
      .mockup-dots { display: flex; gap: 6px; }
      .mockup-dots span {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: var(--border-mid);
      }
      .mockup-title {
        font-size: 0.78rem;
        color: var(--text-muted);
        letter-spacing: 0.3px;
      }
      .mockup-body {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        padding: 24px;
        min-height: 260px;
      }

      .capture-zone {
        border: 0.5px dashed var(--border-accent);
        border-radius: var(--radius-img);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        color: var(--text-muted);
        font-size: 0.85rem;
        font-weight: 500;
        transition: var(--transition-smooth);
        padding: 16px;
      }
      .capture-zone:hover {
        background: var(--accent-dim);
        border-color: var(--accent);
        color: var(--text-main);
      }
      .capture-zone small { font-size: 0.78rem; color: var(--accent); }
      .capture-ring {
        width: 32px; height: 32px;
        border-radius: 50%;
        border: 1.5px solid var(--accent);
        opacity: 0.5;
        animation: ringPulse 2.5s ease-in-out infinite;
      }
      .capture-label { font-size: 0.8rem; }

      .asset-list { display: flex; flex-direction: column; gap: 10px; }
      .asset-row {
        padding: 10px 12px;
        border-radius: 12px;
        border: 0.5px solid var(--border-light);
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 0.8rem;
        background: rgba(255,255,255,0.015);
      }
      .asset-icon { font-size: 1rem; flex-shrink: 0; }
      .asset-row strong { display: block; font-size: 0.8rem; font-weight: 600; }
      .asset-row small { display: block; font-size: 0.75rem; color: var(--accent); margin-top: 2px; }

      @keyframes heroFloat {
        0%, 100% { transform: translateY(0); }
        50%       { transform: translateY(-12px); }
      }
      @keyframes ringPulse {
        0%, 100% { transform: scale(0.85); opacity: 0.3; }
        50%       { transform: scale(1.15); opacity: 0.7; }
      }

      @media (max-width: 1024px) {
        .hero-inner { grid-template-columns: 1fr; gap: 48px; }
        .hero-title { font-size: 2.6rem; }
        .hero-visual { max-width: 520px; }
      }
      @media (max-width: 768px) {
        .hero-section { padding: 120px 0 64px; }
        .hero-title { font-size: 2rem; }
        .hero-metrics { flex-direction: column; gap: 16px; }
        .hero-metric-divider { width: 100%; height: 0.5px; }
        .mockup-body { grid-template-columns: 1fr; }
        .hero-actions { flex-direction: column; }
      }
    `}</style>
  </section>
);

export default Hero;
