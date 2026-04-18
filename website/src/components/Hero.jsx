import React from 'react';

const Hero = () => (
  <section className="hero-section container">
    <div className="hero-content animate-fade-in" style={{ animationDelay: '0.2s' }}>
      <div className="hero-badge glass">养一只你自己的知识龙虾</div>
      <h1 className="hero-title">
        课堂录音还在手机里吃灰？<br />
        会议笔记拍完就<span className="text-gradient">再也没打开过</span>？
      </h1>
      <p className="hero-subtitle">
        不是你不努力，是现在根本没有一个好办法，把你学到的东西轻松地收在一起。
        NoteCapt 让每一次学习、每一场会议都变成可复用的知识资产 — 就像养一只终身生长的知识龙虾，你喂它越多，它越懂你。
      </p>

      <div className="hero-stats">
        <div className="hero-stat">
          <div className="hero-stat-value">0.5s</div>
          <div className="hero-stat-label">Capture Latency</div>
        </div>
        <div className="hero-stat">
          <div className="hero-stat-value">15m</div>
          <div className="hero-stat-label">Directional Range</div>
        </div>
        <div className="hero-stat">
          <div className="hero-stat-value">&infin;</div>
          <div className="hero-stat-label">Asset Compound Value</div>
        </div>
      </div>

      <div className="hero-actions">
        <a href="#" className="btn-primary">免费试用14天 - 看看你能捕获多少知识</a>
        <a href="#loops" className="btn-secondary">3分钟视频演示</a>
      </div>
      <div className="hero-trust">
        <small>无需信用卡 · 随时取消 · 数据完全私有</small>
      </div>
    </div>

    <div className="hero-visual animate-fade-in" style={{ animationDelay: '0.4s' }}>
      <div className="mockup glass">
        <div className="mockup-bar">
          <div className="mockup-dots"><span /><span /><span /></div>
          <div className="mockup-title glass">Your Personal Knowledge Network</div>
        </div>
        <div className="mockup-body">
          <div className="capture-zone">
            <div className="capture-pulse" />
            <span>Capture Anything</span>
            <small>Voice &bull; Photo &bull; Text</small>
          </div>
          <div className="asset-list">
            <div className="asset-row glass"><span>🎓</span><div><strong>Meeting Insight</strong><small>Auto-tagged, Transcribed</small></div></div>
            <div className="asset-row glass"><span>💡</span><div><strong>Research Note</strong><small>Semantic Aligned</small></div></div>
            <div className="asset-row glass"><span>✨</span><div><strong>Learning Resource</strong><small>Ready for LLM</small></div></div>
          </div>
        </div>
      </div>
    </div>

    <style>{`
      .hero-section {
        padding: 160px 20px 80px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      .hero-badge {
        display: inline-block;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--accent);
        margin-bottom: 24px;
      }
      .hero-title { font-size: 4rem; line-height: 1.1; margin-bottom: 24px; }
      .hero-subtitle {
        font-size: 1.1rem;
        color: var(--text-muted);
        max-width: 700px;
        margin-bottom: 12px;
        line-height: 1.7;
      }

      /* Stats */
      .hero-stats { display: flex; gap: 48px; margin: 32px 0; }
      .hero-stat { text-align: center; }
      .hero-stat-value { color: var(--accent); font-size: 1.5rem; font-weight: 700; font-family: 'IBM Plex Mono', monospace; }
      .hero-stat-label { color: var(--text-muted); font-size: 0.8rem; margin-top: 4px; }

      .hero-actions { display: flex; gap: 16px; margin-bottom: 12px; }
      .hero-trust { margin-bottom: 80px; }
      .hero-trust small { color: var(--text-muted); font-size: 0.75rem; }

      /* Mockup */
      .hero-visual { width: 100%; max-width: 880px; perspective: 1000px; }
      .mockup {
        border-radius: 20px;
        padding: 0;
        overflow: hidden;
        box-shadow: 0 40px 100px rgba(0,0,0,0.5);
        transform: rotateX(8deg);
        animation: heroFloat 6s ease-in-out infinite;
      }
      .mockup-bar {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 10px 16px;
        border-bottom: 1px solid var(--glass-border);
      }
      .mockup-dots { display: flex; gap: 6px; }
      .mockup-dots span { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.15); }
      .mockup-title { flex: 1; padding: 4px 12px; border-radius: 8px; font-size: 0.78rem; color: var(--text-muted); text-align: left; }
      .mockup-body {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        padding: 32px;
        min-height: 280px;
      }

      /* Capture zone */
      .capture-zone {
        border: 2px dashed rgba(134,59,255,0.25);
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        color: var(--text-muted);
        font-weight: 500;
        font-size: 0.95rem;
        transition: var(--transition-smooth);
      }
      .capture-zone:hover { border-color: var(--accent); background: rgba(134,59,255,0.06); color: var(--text-main); }
      .capture-zone small { font-size: 0.75rem; color: var(--accent); }
      .capture-pulse {
        width: 36px; height: 36px; border-radius: 50%;
        background: var(--accent); opacity: 0.2;
        animation: pulse 2s ease-in-out infinite;
      }

      /* Assets */
      .asset-list { display: flex; flex-direction: column; gap: 10px; }
      .asset-row {
        padding: 12px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        text-align: left;
        font-size: 0.88rem;
      }
      .asset-row span { font-size: 1.2rem; flex-shrink: 0; }
      .asset-row strong { display: block; font-size: 0.88rem; }
      .asset-row small { display: block; font-size: 0.7rem; color: var(--accent); }

      @keyframes heroFloat {
        0%, 100% { transform: rotateX(8deg) translateY(0); }
        50%      { transform: rotateX(6deg) translateY(-16px); }
      }
      @keyframes pulse {
        0%, 100% { transform: scale(0.85); opacity: 0.2; }
        50%      { transform: scale(1.15); opacity: 0.08; }
      }

      @media (max-width: 768px) {
        .hero-title { font-size: 2.4rem; }
        .hero-stats { gap: 24px; }
        .mockup-body { grid-template-columns: 1fr; }
        .hero-actions { flex-direction: column; align-items: center; }
      }
    `}</style>
  </section>
);

export default Hero;
