import React, { useState } from 'react';

const features = [
  {
    tab: 'Hardware',
    title: 'Hardware: The Scepter of Sovereignty',
    icon: '⚡',
    description: 'A pocket-sized terminal that captures fleeting moments at lightning speed.',
    details: ['0.5s ultra-fast startup', '15m directional microphone', 'Slide scanning for documents', 'TF card zero-friction storage'],
    visual: { emoji: '📱', heading: 'Pocket-Sized Capture Terminal', sub: 'Zero-friction knowledge collection starts here' },
  },
  {
    tab: 'Software',
    title: 'Software: The Asset Steward',
    icon: '🧠',
    description: 'Intelligent organization of your cognitive captures into actionable knowledge.',
    details: ['Automatic semantic alignment', 'AI-powered tagging & classification', 'Real-time transcription & sync', 'LLM gateway integration'],
    visual: { emoji: '🤖', heading: 'Intelligent Asset Management', sub: 'Every capture gets auto-classified and enriched' },
  },
  {
    tab: 'Integration',
    title: 'Integration: Your Knowledge Gateway',
    icon: '🌐',
    description: 'Connect to NotebookLM, custom AI agents, and your digital ecosystem.',
    details: ['Multi-format support', 'One-click export to AI', 'Cross-platform sync', 'Private knowledge sovereignty'],
    visual: { emoji: '🔗', heading: 'Agent Ecosystem Ready', sub: 'Your knowledge becomes AI\'s context' },
  },
];

const Features = () => {
  const [active, setActive] = useState(0);
  const f = features[active];

  return (
    <section id="solution" className="feat-section container">
      <div className="feat-header animate-fade-in">
        <h2 className="section-title">Hardware + Software, <span className="text-gradient">Seamlessly Unified</span></h2>
        <p className="section-subtitle">A complete ecosystem for capturing, organizing, and leveraging your cognitive assets.</p>
      </div>

      <div className="feat-tabs animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <div className="feat-tabs-bar glass">
          {features.map((ft, i) => (
            <button key={i} className={`feat-tab ${active === i ? 'active' : ''}`} onClick={() => setActive(i)}>
              <span>{ft.icon}</span> {ft.tab}
            </button>
          ))}
        </div>

        <div className="feat-panel glass">
          <div className="feat-panel-text">
            <h3>{f.title}</h3>
            <p>{f.description}</p>
            <ul>
              {f.details.map((d, i) => <li key={i}><span className="check">✓</span> {d}</li>)}
            </ul>
          </div>
          <div className="feat-panel-visual">
            <div className="feat-visual-emoji">{f.visual.emoji}</div>
            <div className="feat-visual-heading">{f.visual.heading}</div>
            <small>{f.visual.sub}</small>
          </div>
        </div>
      </div>

      <style>{`
        .feat-section { padding: var(--section-padding); }
        .feat-header { text-align: center; margin-bottom: 60px; }

        .feat-tabs { display: flex; flex-direction: column; gap: 28px; }
        .feat-tabs-bar {
          display: flex; padding: 6px; border-radius: 14px;
          gap: 6px; align-self: center; flex-wrap: wrap; justify-content: center;
        }
        .feat-tab {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 20px; border-radius: 10px;
          color: var(--text-muted); font-weight: 500;
          font-size: 0.9rem;
          transition: var(--transition-smooth);
        }
        .feat-tab:hover { color: var(--text-main); background: rgba(255,255,255,0.03); }
        .feat-tab.active {
          color: var(--text-main);
          background: rgba(134,59,255,0.12);
          box-shadow: 0 2px 10px rgba(134,59,255,0.15);
          border: 1px solid rgba(134,59,255,0.25);
        }

        .feat-panel {
          display: grid;
          grid-template-columns: 1fr 1.2fr;
          gap: 48px; padding: 52px;
          border-radius: 28px;
          align-items: center; text-align: left;
        }
        .feat-panel-text h3 { font-size: 1.6rem; margin-bottom: 20px; }
        .feat-panel-text p  { font-size: 1rem; color: var(--text-muted); margin-bottom: 28px; line-height: 1.7; }
        .feat-panel-text ul { display: flex; flex-direction: column; gap: 14px; }
        .feat-panel-text li { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; font-weight: 500; }
        .check { color: var(--accent); font-weight: 700; }

        .feat-panel-visual {
          background: rgba(0,0,0,0.2); border-radius: 20px; padding: 48px 24px;
          text-align: center; min-height: 280px;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
        }
        .feat-visual-emoji { font-size: 3.5rem; }
        .feat-visual-heading { font-weight: 600; font-size: 1.05rem; }
        .feat-panel-visual small { color: var(--text-muted); font-size: 0.85rem; }

        @media (max-width: 992px) {
          .feat-panel { grid-template-columns: 1fr; padding: 36px; }
          .feat-tabs-bar { flex-direction: column; width: 100%; }
        }
      `}</style>
    </section>
  );
};

export default Features;
