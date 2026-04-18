import React from 'react';

const SmallLoopDiagram = () => (
  <div className="small-loop-diagram">
    <div className="loop-ring">
      <svg viewBox="0 0 300 300" className="loop-svg">
        <defs>
          <linearGradient id="loopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#47bfff" />
            <stop offset="50%" stopColor="#863bff" />
            <stop offset="100%" stopColor="#7e14ff" />
          </linearGradient>
        </defs>
        <circle cx="150" cy="150" r="120" fill="none" stroke="rgba(134,59,255,0.08)" strokeWidth="2" />
        <path
          d="M 150 30 A 120 120 0 0 1 270 150 A 120 120 0 0 1 150 270 A 120 120 0 0 1 30 150 A 120 120 0 0 1 150 30"
          fill="none"
          stroke="url(#loopGrad)"
          strokeWidth="2.5"
          strokeDasharray="16 8"
          className="loop-dash"
        />
      </svg>

      <div className="loop-node node-top">
        <div className="loop-node-icon">📚</div>
        <div className="loop-node-label">Preview</div>
        <div className="loop-node-sub">Know Ahead</div>
      </div>
      <div className="loop-node node-right">
        <div className="loop-node-icon">⚡</div>
        <div className="loop-node-label">Capture</div>
        <div className="loop-node-sub">0.5s Fast</div>
      </div>
      <div className="loop-node node-bottom">
        <div className="loop-node-icon">🧬</div>
        <div className="loop-node-label">Organize</div>
        <div className="loop-node-sub">Auto-Sorted</div>
      </div>
      <div className="loop-node node-left">
        <div className="loop-node-icon">✨</div>
        <div className="loop-node-label">Output</div>
        <div className="loop-node-sub">AI Ready</div>
      </div>

      {/* Arrow tips between nodes */}
      <div className="loop-arrow arrow-tr">→</div>
      <div className="loop-arrow arrow-rb">→</div>
      <div className="loop-arrow arrow-bl">→</div>
      <div className="loop-arrow arrow-lt">→</div>
    </div>

    <style>{`
      .small-loop-diagram {
        display: flex;
        justify-content: center;
        padding: 40px 0;
      }
      .loop-ring {
        position: relative;
        width: 320px;
        height: 320px;
      }
      .loop-svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .loop-dash {
        animation: loopSpin 12s linear infinite;
        transform-origin: center;
      }
      @keyframes loopSpin {
        to { transform: rotate(360deg); }
      }

      .loop-node {
        position: absolute;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        width: 80px;
        text-align: center;
      }
      .node-top    { top: -8px;   left: 50%; transform: translateX(-50%); }
      .node-right  { right: -12px; top: 50%; transform: translateY(-50%); }
      .node-bottom { bottom: -8px; left: 50%; transform: translateX(-50%); }
      .node-left   { left: -12px;  top: 50%; transform: translateY(-50%); }

      .loop-node-icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.6rem;
        background: rgba(134, 59, 255, 0.12);
        border: 1px solid rgba(134, 59, 255, 0.3);
      }
      .loop-node-label { font-size: 0.8rem; font-weight: 600; color: var(--text-main); }
      .loop-node-sub   { font-size: 0.65rem; color: var(--accent-light); }

      /* Arrow tips */
      .loop-arrow {
        position: absolute;
        font-size: 0.8rem;
        color: var(--accent);
        opacity: 0.7;
      }
      .arrow-tr { top: 18%;  right: 15%; transform: rotate(-45deg); }
      .arrow-rb { bottom: 18%; right: 15%; transform: rotate(45deg); }
      .arrow-bl { bottom: 18%; left: 15%;  transform: rotate(135deg); }
      .arrow-lt { top: 18%;  left: 15%;  transform: rotate(-135deg); }

      @media (max-width: 640px) {
        .loop-ring { width: 260px; height: 260px; }
        .loop-node-icon { width: 40px; height: 40px; font-size: 1.3rem; }
        .loop-node { width: 70px; }
      }
    `}</style>
  </div>
);

export default SmallLoopDiagram;
