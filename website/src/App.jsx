import React from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import PainPoints from './components/PainPoints';
import Comparison from './components/Comparison';
import Features from './components/Features';
import SmallLoopDiagram from './components/SmallLoopDiagram';
import BigLoopDiagram from './components/BigLoopDiagram';
import './App.css';

function App() {
  return (
    <div className="app-wrapper">
      <Navbar />
      <main>
        <Hero />
        <PainPoints />
        <Comparison />
        <Features />

        {/* Small Loop: Real Workflow */}
        <section id="loops" className="section container animate-fade-in">
          <div className="section-header">
            <h2 className="section-title">用起来是<span className="text-gradient">什么感觉</span>？</h2>
            <p className="section-subtitle">
              从坐进教室到知识可用，全程零摩擦
            </p>
          </div>

          <SmallLoopDiagram />

          <div className="loop-grid glass">
            <div className="loop-step">
              <div className="loop-step-icon">📚</div>
              <div className="loop-time">课前 8:50</div>
              <h4>你的龙虾帮你预习</h4>
              <p>明天有宏观经济学第7讲。龙虾从日历知道了，把过去6讲相关笔记自动唤醒推送给你。你带着预热好的大脑去上课。</p>
            </div>
            <div className="loop-step">
              <div className="loop-step-icon">⚡</div>
              <div className="loop-time">课中 9:15</div>
              <h4>0.5秒，按下就好</h4>
              <p>不用掏手机。按一下快门，拍照和录音同时进行。每张照片自动锚定录音时间轴 — 我们叫它"实况知识"。</p>
            </div>
            <div className="loop-step">
              <div className="loop-step-icon">🧬</div>
              <div className="loop-time">课后 10:30</div>
              <h4>采集即治理</h4>
              <p>打开电脑，「宏观经济学-第7讲」文件夹已经在了。录音、照片、扫描件按时间线排好。你做完采集，整理就完成了。</p>
            </div>
            <div className="loop-step">
              <div className="loop-step-icon">✨</div>
              <div className="loop-time">输出时</div>
              <h4>一键投喂AI</h4>
              <p>把整个文件夹拖进NotebookLM。10秒钟，复习提纲、知识卡片、论文框架就出来了。</p>
            </div>
          </div>
        </section>

        {/* Big Loop: Asset Appreciation */}
        <section id="future" className="section container animate-fade-in">
          <div className="section-header">
            <h2 className="section-title">The <span className="text-gradient">Big Loop</span>: Your Assets Compound</h2>
            <p className="section-subtitle">
              As you use NoteCapt, accumulated data becomes your private domain context — something general AI can never reach.
            </p>
          </div>

          <BigLoopDiagram />

          <div className="big-loop-cards">
            <div className="big-loop-card glass">
              <div className="big-loop-card-icon">🧠</div>
              <h4>Train Your Second Brain</h4>
              <p>Your knowledge library becomes a "real-world context" filled with your personal logic, emotions, and connections — territory general LLMs can never access.</p>
              <div className="big-loop-card-tag">Private Domain Advantage</div>
            </div>
            <div className="big-loop-card glass">
              <div className="big-loop-card-icon">🤝</div>
              <h4>Knowledge Consulting & Trade</h4>
              <p>When external Bot agents need precise personal experience, they request authorization from your knowledge sovereignty. You control the terms.</p>
              <div className="big-loop-card-tag">Agent Economy Ready</div>
            </div>
            <div className="big-loop-card glass">
              <div className="big-loop-card-icon">💰</div>
              <h4>Monetize Your Assets</h4>
              <p>Every learning deposit becomes tradeable. Your knowledge is no longer a hard drive burden — it's a digital asset generating revenue in the Agent ecosystem.</p>
              <div className="big-loop-card-tag">Passive Knowledge Income</div>
            </div>
          </div>
        </section>

        {/* Why Now? */}
        <section className="section container animate-fade-in">
          <h2 className="section-title">Why <span className="text-gradient">Now?</span></h2>
          <div className="why-now-card glass">
            <p>
              <strong>General AI has erased information differentiation.</strong> The only true asset left is <span className="text-gradient">your private domain context</span> — what you personally experienced, captured, and managed.
            </p>
            <p>
              NoteCapt doesn't just help you keep these assets. It helps them <strong>compound in value</strong>, turning them into your competitive edge in the Agent era.
            </p>
            <div style={{ marginTop: 40 }}>
              <a href="#" className="btn-primary">Start Your Knowledge Sovereignty</a>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="section container">
          <div className="cta-card glass">
            <h2>Ready to Build Your Knowledge Sovereign?</h2>
            <p>Join our beta today. Stop losing cognitive fragments. Start building assets that compound.</p>
            <div className="cta-btns">
              <a href="#" className="btn-primary">Download Beta</a>
              <a href="#" className="btn-secondary">Read Documentation</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>&copy; 2026 NoteCapt. Knowledge Sovereignty for Everyone.</p>
          <div className="footer-links">
            <a href="#">Twitter</a>
            <a href="#">GitHub</a>
            <a href="#">Discord</a>
            <a href="#">Contact</a>
          </div>
        </div>
      </footer>

      <div className="persistent-mascot glass animate-fade-in">◈</div>
    </div>
  );
}

export default App;
