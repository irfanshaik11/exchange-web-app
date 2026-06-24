import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { FaArrowRight } from "react-icons/fa";

export default function Landing() {
  return (
    <>
      <Head>
        <title>Interstate — Trade any market, any time, from anywhere</title>
        <meta
          name="description"
          content="Trade any market, any time, from anywhere. 24/7 Markets, up to 200x leverage, instant settlement."
        />
      </Head>

      <div className="landing-root">
        {/* Nav */}
        <nav className="landing-nav">
          <Link href="/" className="landing-logo-link">
            <Image
              src="/interstate-logo.png"
              alt="Interstate"
              width={130}
              height={28}
              priority
            />
          </Link>
          <Link href="/pulse" className="landing-cta-sm">
            Start trading <FaArrowRight className="landing-cta-arrow" />
          </Link>
        </nav>

        {/* Hero */}
        <section className="landing-hero">
          <h1 className="landing-headline">
            Trade any market,{" "}
            <br className="hidden sm:block" />
            any time,
            <br />
            from anywhere.
          </h1>

          <div className="landing-badges">
            <span className="landing-badge">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 0.5C3.41 0.5 0.5 3.41 0.5 7C0.5 10.59 3.41 13.5 7 13.5C10.59 13.5 13.5 10.59 13.5 7C13.5 3.41 10.59 0.5 7 0.5ZM5.75 10.25L2.5 7L3.4125 6.0875L5.75 8.4175L10.5875 3.58L11.5 4.5L5.75 10.25Z"
                  fill="#18c48c"
                />
              </svg>
              24/7 Markets
            </span>
            <span className="landing-badge">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 0.5C3.41 0.5 0.5 3.41 0.5 7C0.5 10.59 3.41 13.5 7 13.5C10.59 13.5 13.5 10.59 13.5 7C13.5 3.41 10.59 0.5 7 0.5ZM5.75 10.25L2.5 7L3.4125 6.0875L5.75 8.4175L10.5875 3.58L11.5 4.5L5.75 10.25Z"
                  fill="#18c48c"
                />
              </svg>
              Up to 200x leverage
            </span>
            <span className="landing-badge">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 0.5C3.41 0.5 0.5 3.41 0.5 7C0.5 10.59 3.41 13.5 7 13.5C10.59 13.5 13.5 10.59 13.5 7C13.5 3.41 10.59 0.5 7 0.5ZM5.75 10.25L2.5 7L3.4125 6.0875L5.75 8.4175L10.5875 3.58L11.5 4.5L5.75 10.25Z"
                  fill="#18c48c"
                />
              </svg>
              Instant settlement
            </span>
          </div>

          <Link href="/pulse" className="landing-cta-lg">
            Start trading <FaArrowRight className="landing-cta-arrow" />
          </Link>
        </section>

        {/* Product Screenshot */}
        <section className="landing-product">
          <div className="landing-product-glow" />
          <div className="landing-product-frame">
            {/* Desktop mockup - use a placeholder div styled to look like a trading UI */}
            <div className="landing-mockup-desktop">
              <div className="landing-mockup-bar">
                <div className="landing-mockup-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="landing-mockup-url">interstate.so</div>
              </div>
              <div className="landing-mockup-body">
                <div className="landing-mockup-sidebar">
                  <div className="landing-mockup-sidebar-item active" />
                  <div className="landing-mockup-sidebar-item" />
                  <div className="landing-mockup-sidebar-item" />
                  <div className="landing-mockup-sidebar-item" />
                </div>
                <div className="landing-mockup-chart">
                  <div className="landing-mockup-chart-header">
                    <div className="landing-mockup-pair">
                      <div className="landing-mockup-pair-icon" />
                      <div>
                        <div className="landing-mockup-pair-name" />
                        <div className="landing-mockup-pair-price" />
                      </div>
                    </div>
                  </div>
                  <svg
                    className="landing-mockup-chart-svg"
                    viewBox="0 0 400 120"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient
                        id="chartGrad"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#18c48c"
                          stopOpacity="0.3"
                        />
                        <stop
                          offset="100%"
                          stopColor="#18c48c"
                          stopOpacity="0"
                        />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,80 L20,75 L40,78 L60,60 L80,65 L100,50 L120,55 L140,40 L160,45 L180,35 L200,38 L220,30 L240,32 L260,25 L280,28 L300,20 L320,22 L340,15 L360,18 L380,10 L400,12"
                      stroke="#18c48c"
                      strokeWidth="2"
                      fill="none"
                    />
                    <path
                      d="M0,80 L20,75 L40,78 L60,60 L80,65 L100,50 L120,55 L140,40 L160,45 L180,35 L200,38 L220,30 L240,32 L260,25 L280,28 L300,20 L320,22 L340,15 L360,18 L380,10 L400,12 L400,120 L0,120 Z"
                      fill="url(#chartGrad)"
                    />
                  </svg>
                </div>
                <div className="landing-mockup-orderbook">
                  {[...Array(8)].map((_, i) => (
                    <div
                      key={i}
                      className={`landing-mockup-ob-row ${i < 4 ? "sell" : "buy"}`}
                    >
                      <div
                        className="landing-mockup-ob-fill"
                        style={{ width: `${30 + Math.random() * 60}%` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile mockup */}
            <div className="landing-mockup-mobile">
              <div className="landing-mockup-mobile-notch" />
              <div className="landing-mockup-mobile-header">
                <div className="landing-mockup-pair-icon small" />
                <span>Gold</span>
              </div>
              <div className="landing-mockup-mobile-chart">
                <svg viewBox="0 0 160 80" preserveAspectRatio="none">
                  <path
                    d="M0,60 L15,55 L30,58 L45,40 L60,45 L75,35 L90,38 L105,25 L120,28 L135,18 L160,20"
                    stroke="#18c48c"
                    strokeWidth="1.5"
                    fill="none"
                  />
                </svg>
              </div>
              <div className="landing-mockup-mobile-price">
                <span className="landing-mockup-mobile-value">2,637.40</span>
                <span className="landing-mockup-mobile-change">+1.24%</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <style jsx>{`
        .landing-root {
          min-height: 100vh;
          background: #030304;
          color: #f4f4f5;
          font-family: "Inter", "Geist", system-ui, sans-serif;
          overflow-x: hidden;
        }

        /* Nav */
        .landing-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 40px;
          max-width: 1280px;
          margin: 0 auto;
        }

        .landing-logo-link {
          display: flex;
          align-items: center;
        }

        /* CTA Buttons */
        .landing-cta-sm {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          color: #f4f4f5;
          font-size: 14px;
          font-weight: 500;
          text-decoration: none;
          transition: all 0.2s;
        }
        .landing-cta-sm:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .landing-cta-lg {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 28px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          color: #f4f4f5;
          font-size: 16px;
          font-weight: 500;
          text-decoration: none;
          transition: all 0.2s;
          margin-top: 8px;
        }
        .landing-cta-lg:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.25);
        }

        :global(.landing-cta-arrow) {
          font-size: 12px;
          transition: transform 0.2s;
        }
        .landing-cta-sm:hover :global(.landing-cta-arrow),
        .landing-cta-lg:hover :global(.landing-cta-arrow) {
          transform: translateX(2px);
        }

        /* Hero */
        .landing-hero {
          text-align: center;
          padding: 80px 24px 40px;
          max-width: 800px;
          margin: 0 auto;
        }

        .landing-headline {
          font-size: clamp(36px, 6vw, 64px);
          font-weight: 600;
          line-height: 1.1;
          letter-spacing: -0.02em;
          margin: 0 0 32px;
          color: #f4f4f5;
        }

        .landing-badges {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 24px;
          flex-wrap: wrap;
          margin-bottom: 36px;
        }

        .landing-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #a1a1aa;
        }

        /* Product Section */
        .landing-product {
          position: relative;
          max-width: 1100px;
          margin: 40px auto 0;
          padding: 0 24px 80px;
        }

        .landing-product-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 600px;
          height: 400px;
          background: radial-gradient(
            ellipse,
            rgba(24, 196, 140, 0.08) 0%,
            transparent 70%
          );
          pointer-events: none;
        }

        .landing-product-frame {
          position: relative;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 0;
        }

        /* Desktop Mockup */
        .landing-mockup-desktop {
          width: 100%;
          max-width: 900px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: #08090c;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6),
            0 0 40px rgba(24, 196, 140, 0.05);
        }

        .landing-mockup-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          background: #0c0e12;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .landing-mockup-dots {
          display: flex;
          gap: 6px;
        }
        .landing-mockup-dots span {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
        }
        .landing-mockup-dots span:first-child {
          background: #ef4444;
        }
        .landing-mockup-dots span:nth-child(2) {
          background: #f59e0b;
        }
        .landing-mockup-dots span:nth-child(3) {
          background: #22c55e;
        }

        .landing-mockup-url {
          font-size: 12px;
          color: #71717a;
          background: rgba(255, 255, 255, 0.04);
          padding: 4px 12px;
          border-radius: 6px;
          flex: 1;
          text-align: center;
        }

        .landing-mockup-body {
          display: grid;
          grid-template-columns: 48px 1fr 140px;
          min-height: 320px;
        }

        .landing-mockup-sidebar {
          background: #0a0b0e;
          border-right: 1px solid rgba(255, 255, 255, 0.06);
          padding: 12px 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .landing-mockup-sidebar-item {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.04);
        }
        .landing-mockup-sidebar-item.active {
          background: rgba(24, 196, 140, 0.15);
          border: 1px solid rgba(24, 196, 140, 0.3);
        }

        .landing-mockup-chart {
          padding: 16px;
          display: flex;
          flex-direction: column;
        }

        .landing-mockup-chart-header {
          margin-bottom: 12px;
        }

        .landing-mockup-pair {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .landing-mockup-pair-icon {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fbbf24, #d97706);
        }
        .landing-mockup-pair-icon.small {
          width: 20px;
          height: 20px;
        }

        .landing-mockup-pair-name {
          width: 60px;
          height: 10px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.15);
          margin-bottom: 4px;
        }
        .landing-mockup-pair-price {
          width: 80px;
          height: 8px;
          border-radius: 4px;
          background: rgba(24, 196, 140, 0.3);
        }

        .landing-mockup-chart-svg {
          flex: 1;
          width: 100%;
          min-height: 200px;
        }

        .landing-mockup-orderbook {
          background: #0a0b0e;
          border-left: 1px solid rgba(255, 255, 255, 0.06);
          padding: 16px 8px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          justify-content: center;
        }

        .landing-mockup-ob-row {
          position: relative;
          height: 20px;
          border-radius: 3px;
          overflow: hidden;
        }

        .landing-mockup-ob-fill {
          position: absolute;
          top: 0;
          right: 0;
          height: 100%;
          border-radius: 3px;
        }

        .landing-mockup-ob-row.sell .landing-mockup-ob-fill {
          background: rgba(239, 68, 68, 0.12);
        }
        .landing-mockup-ob-row.buy .landing-mockup-ob-fill {
          background: rgba(34, 197, 94, 0.12);
        }

        /* Mobile Mockup */
        .landing-mockup-mobile {
          position: absolute;
          right: -20px;
          bottom: -20px;
          width: 180px;
          background: #0c0e12;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
          z-index: 2;
        }

        .landing-mockup-mobile-notch {
          width: 60px;
          height: 4px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          margin: 10px auto 0;
        }

        .landing-mockup-mobile-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px 4px;
          font-size: 13px;
          font-weight: 600;
          color: #f4f4f5;
        }

        .landing-mockup-mobile-chart {
          padding: 8px 14px;
        }
        .landing-mockup-mobile-chart svg {
          width: 100%;
          height: 60px;
        }

        .landing-mockup-mobile-price {
          display: flex;
          align-items: baseline;
          gap: 8px;
          padding: 4px 14px 16px;
        }

        .landing-mockup-mobile-value {
          font-size: 18px;
          font-weight: 700;
          color: #f4f4f5;
        }

        .landing-mockup-mobile-change {
          font-size: 12px;
          font-weight: 600;
          color: #18c48c;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .landing-nav {
            padding: 16px 20px;
          }
          .landing-hero {
            padding: 48px 20px 24px;
          }
          .landing-badges {
            gap: 12px;
          }
          .landing-badge {
            font-size: 12px;
          }
          .landing-mockup-body {
            grid-template-columns: 36px 1fr 80px;
            min-height: 220px;
          }
          .landing-mockup-mobile {
            width: 130px;
            right: -10px;
            bottom: -10px;
          }
        }

        @media (max-width: 480px) {
          .landing-mockup-body {
            grid-template-columns: 1fr;
          }
          .landing-mockup-sidebar,
          .landing-mockup-orderbook {
            display: none;
          }
          .landing-mockup-mobile {
            width: 110px;
          }
        }
      `}</style>
    </>
  );
}
