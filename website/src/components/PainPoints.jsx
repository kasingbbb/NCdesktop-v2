import React from 'react';

const scenarios = [
  {
    icon: '🎓',
    persona: '学生 / 终身学习者',
    pain: '上课时教授讲到精彩推导，掏手机解锁、找APP、按录音、切相机拍PPT...等搞定这一切，教授已经翻页了',
    solution: '0.5秒按下快门，录音+拍照同时进行。每张照片自动锚定录音时间轴，复习时点击照片立刻听到那一刻的讲解',
    image: '/images/classroom.png'
  },
  {
    icon: '💼',
    persona: '职场人士',
    pain: '每周5场会议，记了一堆笔记，写周报时还是一片空白。录音在一个APP里，照片在相册和自拍混在一起',
    solution: '会议结束回到电脑，文件夹已自动命名分类生成摘要。拖进AI，10秒生成周报素材',
    image: '/images/workplace.png'
  },
  {
    icon: '✍️',
    persona: '内容创作者 / 研究者',
    pain: '论文due还有7天，花5天翻遍手机电脑拼素材，最后只剩2天写论文。灵感记在各种地方，真要用时找不到',
    solution: '一整个学期的知识已消化好。打开主题文件夹拖进AI，10分钟出框架。7天都用来写论文',
    image: '/images/creator.png'
  }
];

const PainPoints = () => (
  <section className="pain-section container">
    <div className="section-header animate-fade-in">
      <h2 className="section-title">你有没有过<span className="text-gradient">这样的时刻</span>？</h2>
      <p className="section-subtitle">不是你不努力，是现在根本没有一个好办法把知识收在一起</p>
    </div>

    <div className="pain-grid">
      {scenarios.map((s, i) => (
        <div key={i} className="pain-card glass animate-fade-in" style={{ animationDelay: `${i * 0.15}s` }}>
          <div className="pain-card-header">
            <div className="pain-icon">{s.icon}</div>
            <div className="pain-persona">{s.persona}</div>
          </div>

          <div className="pain-content">
            <div className="pain-problem">
              <div className="pain-label">😫 痛点</div>
              <p>{s.pain}</p>
            </div>

            <div className="pain-arrow">→</div>

            <div className="pain-solution">
              <div className="pain-label">✨ 用NoteCapt</div>
              <p>{s.solution}</p>
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
      .pain-grid { display: grid; gap: 32px; margin-top: 48px; }

      .pain-card {
        padding: 36px;
        border-radius: 24px;
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      .pain-card-header {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .pain-icon {
        font-size: 2.5rem;
        width: 64px;
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(134,59,255,0.1);
        border-radius: 16px;
      }

      .pain-persona {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-main);
      }

      .pain-content {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 20px;
        align-items: center;
      }

      .pain-label {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--accent);
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .pain-problem {
        background: rgba(255,59,59,0.08);
        padding: 20px;
        border-radius: 12px;
        border-left: 3px solid rgba(255,59,59,0.4);
      }

      .pain-problem p {
        font-size: 0.9rem;
        line-height: 1.6;
        color: var(--text-muted);
      }

      .pain-arrow {
        font-size: 1.5rem;
        color: var(--accent);
        font-weight: bold;
      }

      .pain-solution {
        background: rgba(59,255,134,0.08);
        padding: 20px;
        border-radius: 12px;
        border-left: 3px solid rgba(59,255,134,0.4);
      }

      .pain-solution p {
        font-size: 0.9rem;
        line-height: 1.6;
        color: var(--text-main);
        font-weight: 500;
      }

      .pain-image-placeholder {
        background: rgba(0,0,0,0.2);
        border: 2px dashed rgba(134,59,255,0.3);
        border-radius: 12px;
        padding: 48px 24px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }

      .placeholder-icon {
        font-size: 3rem;
        opacity: 0.3;
      }

      .pain-image-placeholder small {
        color: var(--text-muted);
        font-size: 0.8rem;
        line-height: 1.5;
        max-width: 500px;
      }

      .pain-image {
        border-radius: 16px;
        overflow: hidden;
        background: rgba(0,0,0,0.1);
      }

      .pain-image img {
        width: 100%;
        height: auto;
        display: block;
      }

      @media (max-width: 992px) {
        .pain-content {
          grid-template-columns: 1fr;
          gap: 16px;
        }
        .pain-arrow {
          transform: rotate(90deg);
          justify-self: center;
        }
      }
    `}</style>
  </section>
);

export default PainPoints;
