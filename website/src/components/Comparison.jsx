import React from 'react';

const comparisons = [
  {
    before: '手机录音 → 忘记整理 → 永远不听',
    after: '自动转文字+分类，随时可搜',
    icon: '🎙️'
  },
  {
    before: '拍照笔记 → 散落相册 → 找不到',
    after: '照片锚定录音，上下文完整',
    icon: '📸'
  },
  {
    before: '各种笔记APP → 信息孤岛 → 拼素材崩溃',
    after: '统一管理，一键导出到AI',
    icon: '🔗'
  },
  {
    before: '7天deadline → 5天找素材 → 2天赶论文',
    after: '知识已消化好 → 7天都用来写',
    icon: '⏰'
  }
];

const Comparison = () => (
  <section className="comparison-section container">
    <div className="section-header animate-fade-in">
      <h2 className="section-title">传统方式 vs <span className="text-gradient">NoteCapt</span></h2>
      <p className="section-subtitle">看看差距在哪里</p>
    </div>

    <div className="comparison-grid">
      {comparisons.map((c, i) => (
        <div key={i} className="comparison-row glass animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
          <div className="comparison-icon">{c.icon}</div>
          <div className="comparison-before">
            <div className="comparison-label">❌ 传统方式</div>
            <p>{c.before}</p>
          </div>
          <div className="comparison-arrow">→</div>
          <div className="comparison-after">
            <div className="comparison-label">✅ 用NoteCapt</div>
            <p>{c.after}</p>
          </div>
        </div>
      ))}
    </div>

    <div className="comparison-image glass">
      <img src="/images/comparison.png" alt="传统方式 vs NoteCapt对比" />
    </div>

    <style>{`
      .comparison-section { padding: var(--section-padding); }
      .comparison-grid { display: flex; flex-direction: column; gap: 20px; margin-top: 48px; margin-bottom: 48px; }

      .comparison-row {
        display: grid;
        grid-template-columns: auto 1fr auto 1fr;
        gap: 20px;
        padding: 24px 32px;
        border-radius: 16px;
        align-items: center;
      }

      .comparison-icon {
        font-size: 2rem;
      }

      .comparison-label {
        font-size: 0.7rem;
        font-weight: 600;
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .comparison-before {
        opacity: 0.7;
      }

      .comparison-before .comparison-label {
        color: rgba(255,59,59,0.8);
      }

      .comparison-before p {
        font-size: 0.9rem;
        color: var(--text-muted);
      }

      .comparison-arrow {
        font-size: 1.5rem;
        color: var(--accent);
        font-weight: bold;
      }

      .comparison-after .comparison-label {
        color: rgba(59,255,134,0.9);
      }

      .comparison-after p {
        font-size: 0.95rem;
        color: var(--text-main);
        font-weight: 600;
      }

      .comparison-image-placeholder {
        padding: 64px 32px;
        border-radius: 20px;
        text-align: center;
        background: rgba(0,0,0,0.2);
        border: 2px dashed rgba(134,59,255,0.3);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      .comparison-image-placeholder .placeholder-icon {
        font-size: 4rem;
        opacity: 0.3;
      }

      .comparison-image-placeholder small {
        color: var(--text-muted);
        font-size: 0.85rem;
        max-width: 600px;
        line-height: 1.5;
      }

      .comparison-image {
        border-radius: 20px;
        overflow: hidden;
        background: rgba(0,0,0,0.1);
        margin-top: 48px;
        margin-bottom: 48px;
      }

      .comparison-image img {
        width: 100%;
        height: auto;
        display: block;
      }

      @media (max-width: 992px) {
        .comparison-row {
          grid-template-columns: 1fr;
          gap: 16px;
          padding: 20px;
        }
        .comparison-icon {
          justify-self: center;
        }
        .comparison-arrow {
          transform: rotate(90deg);
          justify-self: center;
        }
      }
    `}</style>
  </section>
);

export default Comparison;
