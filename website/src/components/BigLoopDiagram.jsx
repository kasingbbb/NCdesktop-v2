import React from 'react';

const levels = [
  { icon: '💰', label: 'Monetize', sub: 'Digital Assets', width: 140 },
  { icon: '🤝', label: 'Trade', sub: 'Consulting Market', width: 200 },
  { icon: '🧠', label: 'Foundation', sub: 'Private Context', width: 260 },
];

const BigLoopDiagram = () => (
  <div className="pyramid">
    {levels.map((lv, i) => (
      <React.Fragment key={i}>
        <div className="pyramid-tier" style={{ width: lv.width }}>
          <div className={`pyramid-block tier-${i}`}>
            <span className="pyramid-icon">{lv.icon}</span>
            <span className="pyramid-text">{lv.label}</span>
          </div>
          <div className="pyramid-sub">{lv.sub}</div>
        </div>
        {i < levels.length - 1 && (
          <div className="pyramid-connector">
            <svg width="2" height="24" viewBox="0 0 2 24">
              <line x1="1" y1="0" x2="1" y2="24" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 3" opacity="0.4" />
            </svg>
          </div>
        )}
      </React.Fragment>
    ))}

    <style>{`
      .pyramid {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0;
        padding: 40px 0;
      }
      .pyramid-tier {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .pyramid-block {
        width: 100%;
        height: 56px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        color: white;
        font-weight: 600;
        font-size: 0.95rem;
        position: relative;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
      }
      .pyramid-block:hover {
        transform: scale(1.04);
      }
      .pyramid-icon { font-size: 1.2rem; }
      .pyramid-sub {
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: 6px;
      }
      .pyramid-connector {
        display: flex;
        justify-content: center;
        padding: 4px 0;
      }

      .tier-0 {
        background: linear-gradient(135deg, #47bfff 0%, #863bff 100%);
        box-shadow: 0 8px 24px rgba(71,191,255,0.2);
      }
      .tier-1 {
        background: linear-gradient(135deg, #863bff 0%, #7e14ff 100%);
        box-shadow: 0 10px 28px rgba(134,59,255,0.25);
      }
      .tier-2 {
        background: linear-gradient(135deg, #7e14ff 0%, #863bff 100%);
        box-shadow: 0 12px 32px rgba(126,20,255,0.3);
      }

      @media (max-width: 640px) {
        .pyramid-block { height: 48px; font-size: 0.85rem; }
        .pyramid-tier:nth-child(1) { width: 120px !important; }
        .pyramid-tier:nth-child(3) { width: 170px !important; }
        .pyramid-tier:nth-child(5) { width: 220px !important; }
      }
    `}</style>
  </div>
);

export default BigLoopDiagram;
