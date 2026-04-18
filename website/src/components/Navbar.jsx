import React from 'react';

const Navbar = () => {
  return (
    <nav className="navbar-container animate-fade-in" style={{ animationDelay: '0.1s' }}>
      <div className="navbar glass">
        <div className="logo">
          <span className="logo-icon">◈</span>
          <span className="logo-text">NoteCapt</span>
          <span className="version">v1.1</span>
        </div>
        <ul className="nav-links">
          <li><a href="#solution">Solution</a></li>
          <li><a href="#loops">Small Loop</a></li>
          <li><a href="#future">Future</a></li>
          <li><a href="#docs">Docs</a></li>
        </ul>
        <div className="nav-cta">
          <a href="#" className="btn-primary">Get Started</a>
        </div>
      </div>
      <style>{`
        .navbar-container {
          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1000;
          width: 100%;
          max-width: 800px;
          padding: 0 20px;
        }
        .navbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 16px 8px 24px;
          border-radius: 99px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 700;
          font-size: 1.1rem;
        }
        .logo-icon {
          color: var(--accent);
          font-size: 1.3rem;
        }
        .version {
          font-size: 0.7rem;
          color: var(--text-muted);
          font-weight: 500;
          margin-left: 4px;
          padding: 2px 6px;
          background: linear-gradient(135deg, rgba(134, 59, 255, 0.15), rgba(71, 191, 255, 0.1));
          border-radius: 4px;
          border: 1px solid rgba(134, 59, 255, 0.2);
        }
        .nav-links {
          display: flex;
          gap: 24px;
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text-muted);
        }
        .nav-links a:hover {
          color: var(--text-main);
        }
        @media (max-width: 768px) {
          .nav-links { display: none; }
          .navbar-container { top: 12px; }
        }
      `}</style>
    </nav>
  );
};

export default Navbar;
