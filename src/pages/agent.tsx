import Head from 'next/head';
import Header from '../components/Header';

import { useState } from 'react';

export default function AgentPage() {
  const [showClaudeModal, setShowClaudeModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const mcpUrl = 'https://coinvest.liquid.trade';

  const handleCopy = () => {
    navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Head>
        <title>Agent | Interstate</title>
        <meta name="description" content="Interstate Agent — AI-powered trading intelligence directly in ChatGPT and Claude." />
      </Head>
      <div className="min-h-screen bg-[#030304] text-white">
        <div className="relative z-[10000]"><Header /></div>

        <div className="agent-page">
          <div className="agent-content">
            {/* Left side */}
            <div className="agent-left">
              <div className="agent-built-for">
                BUILT FOR
                <img src="/interstate/logo.png" alt="Interstate" className="agent-built-logo" />
              </div>

              <h1 className="agent-headline">
                Introducing
                <br />
                <span className="agent-headline-brand">
                  <svg className="agent-sparkle" width="36" height="36" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" fill="#18c48c" />
                  </svg>
                  Interstate Agent
                </span>
              </h1>

              <p className="agent-description">
                Interstate Agent provides advanced market data, high quality analysis, and best-in-class trade execution directly in
                {' '}<span className="agent-highlight-openai">ChatGPT</span> and
                {' '}<span className="agent-highlight-claude">Claude</span>.
              </p>

              <div className="agent-ctas">
                <button
                  onClick={() => setShowClaudeModal(true)}
                  className="agent-cta agent-cta-claude"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4.709 15.955l4.486-2.236a.3.3 0 0 0 .165-.27V8.09a.3.3 0 0 0-.442-.264l-4.486 2.35a.3.3 0 0 0-.158.264v5.25a.3.3 0 0 0 .435.265zm7.591-2.236l4.486 2.236a.3.3 0 0 0 .435-.265v-5.25a.3.3 0 0 0-.158-.264l-4.486-2.35a.3.3 0 0 0-.442.264v5.359a.3.3 0 0 0 .165.27zM12 3.705l4.373 2.18a.3.3 0 0 1 0 .536L12.165 8.6a.3.3 0 0 1-.33 0L7.627 6.42a.3.3 0 0 1 0-.536L12 3.706z" />
                    <path d="M12 14.338l-4.373 2.18a.3.3 0 0 0 0 .535l4.208 2.18a.3.3 0 0 0 .33 0l4.208-2.18a.3.3 0 0 0 0-.535L12 14.338z" opacity="0.5" />
                  </svg>
                  Start on Claude
                </button>
              </div>
            </div>

            {/* Right side — video/media */}
            <div className="agent-right">
              <div className="agent-video-container">
                <div className="agent-video-badge">
                  <img src="/interstate/logo.png" alt="Interstate" className="agent-video-badge-logo" />
                  Interstate
                </div>
                <div className="agent-video-overlay">
                  <span className="agent-video-text">Investing is the hardest</span>
                </div>
                <div className="agent-video-placeholder">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" fill="rgba(255,255,255,0.1)" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Claude Connection Modal */}
        {showClaudeModal && (
          <div className="claude-modal-overlay" onClick={() => setShowClaudeModal(false)}>
            <div className="claude-modal" onClick={(e) => e.stopPropagation()}>
              <button className="claude-modal-close" onClick={() => setShowClaudeModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              <div className="claude-modal-header">CLAUDE</div>

              <div className="claude-modal-steps">
                <div className="claude-modal-step">
                  <div className="claude-modal-step-number">1</div>
                  <div className="claude-modal-step-content">
                    <p className="claude-modal-step-title">Copy the URL below</p>
                    <div className="claude-modal-url-box">
                      <span className="claude-modal-url">{mcpUrl}</span>
                      <button className="claude-modal-copy-btn" onClick={handleCopy}>
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="claude-modal-step">
                  <div className="claude-modal-step-number">2</div>
                  <div className="claude-modal-step-content">
                    <p className="claude-modal-step-title">Click below — the &quot;Add custom connector&quot; dialog opens in Claude Web</p>
                    <a
                      href="https://claude.ai/customize/connectors?modal=add-custom-connector"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="claude-modal-open-btn"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      Open in Claude Web
                    </a>
                  </div>
                </div>

                <div className="claude-modal-step">
                  <div className="claude-modal-step-number">3</div>
                  <div className="claude-modal-step-content">
                    <p className="claude-modal-step-title">Set Name to &quot;Liquid&quot;, paste the URL into &quot;Remote MCP server URL&quot;, then tap Add</p>
                  </div>
                </div>

                <div className="claude-modal-step">
                  <div className="claude-modal-step-number">4</div>
                  <div className="claude-modal-step-content">
                    <p className="claude-modal-step-title">&quot;Connect&quot; next to the new Liquid connector and sign in to link your account</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .agent-page {
          max-width: 1280px;
          margin: 0 auto;
          padding: 60px 48px 80px;
        }

        .agent-content {
          display: flex;
          align-items: center;
          gap: 64px;
        }

        .agent-left {
          flex: 1;
          min-width: 0;
        }

        .agent-right {
          flex: 1;
          min-width: 0;
          display: flex;
          justify-content: flex-end;
        }

        /* Built for */
        .agent-built-for {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.12em;
          color: #71717a;
          text-transform: uppercase;
          margin-bottom: 24px;
        }

        .agent-built-logo {
          width: 20px;
          height: 20px;
          object-fit: contain;
        }

        /* Headline */
        .agent-headline {
          font-size: clamp(32px, 4.5vw, 56px);
          font-weight: 600;
          line-height: 1.1;
          letter-spacing: -0.02em;
          color: #f4f4f5;
          margin: 0 0 24px;
        }

        .agent-headline-brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }

        .agent-sparkle {
          flex-shrink: 0;
        }

        /* Description */
        .agent-description {
          font-size: 17px;
          line-height: 1.65;
          color: #a1a1aa;
          margin: 0 0 36px;
          max-width: 480px;
        }

        .agent-highlight-openai {
          color: #f4f4f5;
          font-weight: 500;
        }

        .agent-highlight-claude {
          color: #d4a574;
          font-weight: 500;
        }

        /* CTAs */
        .agent-ctas {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .agent-cta {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 12px 24px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s;
          cursor: pointer;
          border: none;
          font-family: inherit;
        }

        .agent-cta-claude {
          background: transparent;
          color: #f4f4f5;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .agent-cta-claude:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.25);
          transform: translateY(-1px);
        }

        /* Video / Media */
        .agent-video-container {
          position: relative;
          width: 100%;
          max-width: 520px;
          aspect-ratio: 16 / 10;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: #08090c;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(24, 196, 140, 0.04);
        }

        .agent-video-badge {
          position: absolute;
          top: 16px;
          left: 16px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          font-size: 12px;
          font-weight: 600;
          color: #f4f4f5;
          z-index: 2;
        }

        .agent-video-badge-logo {
          width: 16px;
          height: 16px;
          object-fit: contain;
        }

        .agent-video-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 40px 24px 24px;
          background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
          z-index: 2;
        }

        .agent-video-text {
          font-size: clamp(18px, 2.5vw, 28px);
          font-weight: 700;
          color: #f4f4f5;
          text-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
        }

        .agent-video-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0c0e12 0%, #141720 100%);
        }

        /* Dot pattern background */
        .agent-video-placeholder::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(24, 196, 140, 0.15) 1px, transparent 1px);
          background-size: 20px 20px;
          opacity: 0.5;
        }

        /* Responsive */
        @media (max-width: 900px) {
          .agent-page {
            padding: 40px 24px 60px;
          }
          .agent-content {
            flex-direction: column;
            gap: 48px;
          }
          .agent-right {
            justify-content: center;
            width: 100%;
          }
          .agent-video-container {
            max-width: 100%;
          }
        }

        /* Claude Modal */
        .claude-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          padding: 24px;
        }

        .claude-modal {
          position: relative;
          background: #111113;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 36px 32px;
          max-width: 460px;
          width: 100%;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
        }

        .claude-modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          background: none;
          border: none;
          color: #71717a;
          cursor: pointer;
          padding: 4px;
          transition: color 0.15s;
        }
        .claude-modal-close:hover {
          color: #f4f4f5;
        }

        .claude-modal-header {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.15em;
          color: #d4a574;
          margin-bottom: 28px;
        }

        .claude-modal-steps {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .claude-modal-step {
          display: flex;
          gap: 14px;
        }

        .claude-modal-step-number {
          flex-shrink: 0;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.08);
          color: #a1a1aa;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 1px;
        }

        .claude-modal-step-content {
          flex: 1;
          min-width: 0;
        }

        .claude-modal-step-title {
          font-size: 14px;
          line-height: 1.5;
          color: #d4d4d8;
          margin: 0 0 10px;
        }

        .claude-modal-url-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 10px 12px;
        }

        .claude-modal-url {
          flex: 1;
          font-size: 13px;
          color: #a1a1aa;
          font-family: monospace;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .claude-modal-copy-btn {
          flex-shrink: 0;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 6px;
          color: #f4f4f5;
          font-size: 12px;
          font-weight: 600;
          padding: 5px 14px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .claude-modal-copy-btn:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .claude-modal-open-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          color: #f4f4f5;
          font-size: 13px;
          font-weight: 600;
          padding: 10px 18px;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.15s;
        }
        .claude-modal-open-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.2);
        }

        @media (max-width: 480px) {
          .agent-page {
            padding: 24px 16px 48px;
          }
          .agent-ctas {
            flex-direction: column;
          }
          .agent-cta {
            justify-content: center;
          }
          .agent-description {
            font-size: 15px;
          }
        }
      `}</style>
    </>
  );
}
