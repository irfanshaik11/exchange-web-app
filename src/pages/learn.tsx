import Head from "next/head";
import Link from "next/link";
import { FaArrowRight, FaArrowUpRightFromSquare, FaXTwitter } from "react-icons/fa6";
import Header from "../components/Header";
import {
  SiBitcoin,
  SiSolana,
  SiEthereum,
  SiGoogle,
  SiApple,
  SiNvidia,
  SiTesla,
  SiSpacex,
  SiRipple,
  SiOpenai,
  SiDogecoin,
} from "react-icons/si";

/* ----------------------------- data ----------------------------- */

type Market = {
  name: string;
  sym: string;
  icon: React.ReactNode;
  bg: string;
  fg?: string;
};

const dot = (label: string, color: string) => (
  <span style={{ color, fontWeight: 700, fontSize: 13 }}>{label}</span>
);

const marketsRow1: Market[] = [
  { name: "Nvidia", sym: "NVDA", icon: <SiNvidia />, bg: "#0d2818", fg: "#76b900" },
  { name: "Solana", sym: "SOL", icon: <SiSolana />, bg: "#0a0a0a", fg: "#14f195" },
  { name: "Crude Oil", sym: "CL", icon: dot("CL", "#c98b3c"), bg: "#2a1c0e" },
  { name: "OpenAI", sym: "OPENAI", icon: <SiOpenai />, bg: "#ffffff", fg: "#0a0a0a" },
  { name: "Bitcoin", sym: "BTC", icon: <SiBitcoin />, bg: "#f7931a", fg: "#ffffff" },
  { name: "Google", sym: "GOOG", icon: <SiGoogle />, bg: "#ffffff", fg: "#4285f4" },
  { name: "Gold", sym: "XAU", icon: dot("Au", "#e8c14a"), bg: "#3a300f" },
  { name: "Tesla", sym: "TSLA", icon: <SiTesla />, bg: "#e31937", fg: "#ffffff" },
  { name: "Ethereum", sym: "ETH", icon: <SiEthereum />, bg: "#1a1a2e", fg: "#a8b0e0" },
];

const marketsRow2: Market[] = [
  { name: "Dogecoin", sym: "DOGE", icon: <SiDogecoin />, bg: "#1c1708", fg: "#c2a633" },
  { name: "SpaceX", sym: "SPACEX", icon: <SiSpacex />, bg: "#0a0a0a", fg: "#ffffff" },
  { name: "Silver", sym: "XAG", icon: dot("Ag", "#c0c0c8"), bg: "#26282b" },
  { name: "Sui", sym: "SUI", icon: dot("S", "#4da2ff"), bg: "#0c2a52", fg: "#4da2ff" },
  { name: "Coreweave", sym: "CRWV", icon: dot("CW", "#ffffff"), bg: "#101114" },
  { name: "Nasdaq 100", sym: "NDX", icon: dot("100", "#4da2ff"), bg: "#0c2540" },
  { name: "Apple", sym: "AAPL", icon: <SiApple />, bg: "#0a0a0a", fg: "#ffffff" },
  { name: "BNB", sym: "BNB", icon: <img src="https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png" alt="BNB" style={{ width: 16, height: 16, borderRadius: '50%' }} />, bg: "#1c1708", fg: "#f0b90b" },
  { name: "Anthropic", sym: "ANTHR", icon: dot("A", "#0a0a0a"), bg: "#ffffff" },
];

const marketsRow3: Market[] = [
  { name: "Samsung", sym: "SMSN", icon: dot("S", "#ffffff"), bg: "#1428a0" },
  { name: "Dow Jones", sym: "DJI", icon: dot("DJ", "#9aa5b1"), bg: "#1d2733" },
  { name: "Ripple", sym: "XRP", icon: <SiRipple />, bg: "#0a0a0a", fg: "#ffffff" },
  { name: "Oracle", sym: "ORCL", icon: dot("O", "#ffffff"), bg: "#c74634" },
  { name: "ExxonMobil", sym: "XOM", icon: dot("EX", "#e31937"), bg: "#fff" },
  { name: "Alibaba", sym: "BABA", icon: dot("a", "#ff6a00"), bg: "#2a1505" },
  { name: "SK Hynix", sym: "SKHX", icon: dot("SK", "#ff5a36"), bg: "#1a1410" },
  { name: "Platinum", sym: "XPT", icon: dot("Pt", "#cdd2d8"), bg: "#26282b" },
  { name: "Chainlink", sym: "LINK", icon: dot("◈", "#ffffff"), bg: "#2a5ada" },
];

const press = [
  "Bloomberg",
  "FORTUNE",
  "WSJ PRO",
  "AXIOS",
  "THE BLOCK",
  "decrypt",
  "CoinMarketCap",
  "TradingView",
];

const testimonials = [
  {
    name: "Paradigm",
    handle: "@paradigm",
    initial: "P",
    color: "#6b7280",
    text: "Paradigm leads $7.6 million seed funding round for perp DEX aggregator Liquid.",
  },
  {
    name: "YAHOOSKI",
    handle: "@shakespoppi",
    initial: "SH",
    color: "#f97316",
    text: "It doesn't feel like you're using an ordinary trading platform. Everything is already where you expect it to be.",
  },
  {
    name: "STER",
    handle: "@sterjke",
    initial: "S",
    color: "#3b82f6",
    text: "You connect your wallet, watch the flow, and when the moment comes, you just take it. No ceremony. Just the trade.",
  },
  {
    name: "Waytoff",
    handle: "@waytoff_",
    initial: "W",
    color: "#60a5fa",
    text: "Mobile first DeFi apps are becoming more important every cycle. @liquidtrading is building around that with a strong focus on mobile and speed.",
  },
];

const testimonials2 = [
  {
    name: "z4ch",
    handle: "@0xz4ch",
    initial: "Z",
    color: "#3b82f6",
    text: "guys what are we trading / predicting today? @liquidtrading has so many prediction markets live right now",
  },
  {
    name: "wcu",
    handle: "@spyruxs",
    initial: "W",
    color: "#a855f7",
    text: "it is time for us hyperliquid maxis to finally rise up against the evil short sellers @liquidtrading",
  },
  {
    name: "PHEONIX",
    handle: "@pnxgrp",
    initial: "P",
    color: "#f97316",
    text: "Liquid secures $7.6M in a Seed funding round led by Paradigm, with participation from General Catalyst, Alpen and angel investors.",
  },
  {
    name: "Crypto Fundraises",
    handle: "@Crypto_Dealflow",
    initial: "CF",
    color: "#3b82f6",
    text: "Decentralized leverage trading platform @liquidtrading raised $7.60M in a Seed funding round led by Paradigm.",
  },
];

/* footer link map */
const footerCols = [
  {
    title: "Markets",
    groups: [
      { h: "PRE-IPO", items: ["SpaceX", "OpenAI", "Anthropic"] },
      { h: "STOCKS", items: ["TSLA", "AAPL", "NVDA", "GOOG"] },
      { h: "COMMODITIES", items: ["Gold", "Silver", "Oil", "Copper"] },
      { h: "CRYPTO", items: ["BTC", "ETH", "SOL", "LINK", "DOGE"] },
      { h: "FOREX", items: [] },
    ],
  },
  {
    title: "Predictions",
    groups: [
      {
        h: "POLITICS",
        items: ["Dem Nominee 2028", "Trump Visits China", "GOP Nominee 2028", "US-Iran Ceasefire"],
      },
      { h: "SPORTS", items: ["FIFA World Cup '26", "NCAA Tournament '26", "F1 Champion '26"] },
      { h: "FINANCE", items: ["Kraken IPO", "SPCE Earnings", "Consensys IPO", "MicroStrategy Sells BTC"] },
      { h: "TECH", items: ["OpenAI Hardware", "GPT-6 Release", "ChatGPT Outage", "Tesla Q1 Deliveries"] },
      { h: "CLIMATE", items: ["March '26 Temp"] },
    ],
  },
  {
    title: "Blog",
    groups: [
      { h: "TRADING", items: ["Leverage Trading", "Short Selling", "Liquidation"] },
      { h: "RISK", items: ["Stop Loss", "Short Squeeze", "Cross vs Isolated"] },
      { h: "MECHANICS", items: ["Funding Rates", "Airdrop Farming"] },
      { h: "PRE-IPO", items: ["SpaceX Perps", "OpenAI Perps", "Anthropic Perps"] },
    ],
  },
];

const companyLinks = ["Support", "Docs", "Terms of Service", "Privacy Policy", "Careers", "Brand Kit", "Audits"];
const socialLinks = ["X", "TikTok", "Instagram", "Youtube", "Telegram", "Discord", "LinkedIn"];

/* ----------------------------- components ----------------------------- */

function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="lq-logo">
      <img
        src="/interstate/logo.png"
        alt="Interstate logo"
        className="lq-logo-mark"
        style={{ width: size + 6, height: size + 6 }}
      />
      <span className="lq-logo-text" style={{ fontSize: size * 0.82 }}>
        interstate
      </span>
    </span>
  );
}

function MarketPill({ m }: { m: Market }) {
  return (
    <div className="lq-pill">
      <span className="lq-pill-icon" style={{ background: m.bg, color: m.fg }}>
        {m.icon}
      </span>
      <span className="lq-pill-text">
        <span className="lq-pill-name">{m.name}</span>
        <span className="lq-pill-sym">{m.sym}</span>
      </span>
    </div>
  );
}

function Marquee({ items, reverse }: { items: Market[]; reverse?: boolean }) {
  const doubled = [...items, ...items];
  return (
    <div className="lq-marquee">
      <div className={`lq-marquee-track ${reverse ? "rev" : ""}`}>
        {doubled.map((m, i) => (
          <MarketPill key={`${m.sym}-${i}`} m={m} />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- page ----------------------------- */

export default function Landing() {
  return (
    <>
      <Head>
        <title>Liquid — Trade Like The 1%</title>
        <meta
          name="description"
          content="Trade any market, any time, from anywhere. 500+ markets from Bitcoin and Gold to FX and stocks, with instant settlement."
        />
      </Head>

      <div className="lq-root">
        {/* Standard app header */}
        <div className="relative z-[10000]">
          <Header />
        </div>

        {/* Hero */}
        <header className="lq-hero">
          <h1 className="lq-hero-title">
            Trade any market, any time,
            <br />
            from anywhere.
          </h1>

          <div className="lq-hero-badges">
            <span className="lq-badge">
              <Check /> 24/7 Markets
            </span>
            <span className="lq-badge">
              <Check /> Instant settlement
            </span>
          </div>

          <Link href="/" className="lq-hero-cta">
            Start trading <FaArrowRight size={12} />
          </Link>
        </header>

        {/* Product screenshot */}
        <section className="lq-product">
          <div className="lq-product-glow" />
          <div className="lq-app-shot">
            <img
              src="/pulse.png"
              alt="Interstate trading app showing the Trenches dashboard with live markets"
              width={3438}
              height={1816}
            />
          </div>
        </section>

        {/* Press logos */}
        <section className="lq-press">
          <div className="lq-press-row">
            {press.map((p) => (
              <span key={p} className="lq-press-item">
                {p}
              </span>
            ))}
          </div>
        </section>

        {/* 500+ markets */}
        <section className="lq-section lq-markets">
          <div className="lq-markets-head">
            <h2 className="lq-h2">
              Trade <span className="lq-white">500+ markets</span>, from{" "}
              <span className="lq-inline-icon" style={{ background: "#f7931a", color: "#fff" }}>
                <SiBitcoin />
              </span>{" "}
              <span className="lq-white">Bitcoin</span> and{" "}
              <span className="lq-inline-icon" style={{ background: "#3a300f", color: "#e8c14a" }}>
                Au
              </span>{" "}
              <span className="lq-white">GOLD</span> to FX and stocks, in seconds.
            </h2>
            <div className="lq-tabs">
              <button className="active">All</button>
              <button>Crypto</button>
              <button>Real World</button>
            </div>
          </div>

          <div className="lq-marquees">
            <Marquee items={marketsRow1} />
            <Marquee items={marketsRow2} reverse />
            <Marquee items={marketsRow3} />
          </div>
        </section>

        {/* Trading simplified */}
        <section className="lq-section">
          <h2 className="lq-h2 lq-h2-lg">
            <span className="lq-white">Trading, simplified.</span> Pick a market, choose a direction,
            set your leverage, and you&apos;re set.
          </h2>
          <div className="lq-three">
            <div className="lq-three-col">
              <div className="lq-step">01</div>
              <h3>Pick a market</h3>
              <p>From Bitcoin and Gold to Tesla and FX — choosing what to trade is the core of every trade.</p>
            </div>
            <div className="lq-three-col">
              <div className="lq-step">02</div>
              <h3>Set your leverage</h3>
              <p>Dial in your exposure with full control over your position size.</p>
            </div>
            <div className="lq-three-col">
              <div className="lq-step">03</div>
              <h3>Execute instantly</h3>
              <p>Open and close positions in seconds, 24/7, with instant on-chain settlement.</p>
            </div>
          </div>
        </section>

        {/* See it. Size it. Snipe it. */}
        <section className="lq-section">
          <h2 className="lq-h2 lq-h2-lg">
            <span className="lq-white">See it. Size it. Snipe it.</span> Tools to find new token
            launches within 100ms of launch, enabling you to snipe tokens as they&apos;re newly
            launched or migrated across every market.
          </h2>
          <div className="lq-showcase">
            <div className="lq-showcase-card lq-showcase-desktop">
              <MiniTrading />
            </div>
            <div className="lq-showcase-card lq-showcase-list">
              <MiniAssetList />
            </div>
            <div className="lq-showcase-card lq-showcase-phone">
              <MiniOrder />
            </div>
          </div>
        </section>


        {/* Trusted by */}
        <section className="lq-section lq-trusted">
          <div className="lq-trusted-head">
            <div>
              <h2 className="lq-h2 lq-h2-lg lq-white" style={{ margin: 0 }}>
                Trusted by 40,000+ traders
              </h2>
              <p className="lq-trusted-sub">See what traders are saying.</p>
            </div>
            <Link
              href="https://x.com/interstatefdn"
              target="_blank"
              rel="noopener noreferrer"
              className="lq-follow"
            >
              Follow Interstate on <FaXTwitter size={13} />
            </Link>
          </div>

          <div className="lq-tweets">
            {testimonials.map((t) => (
              <Tweet key={t.handle} t={t} />
            ))}
          </div>
          <div className="lq-tweets lq-tweets-2">
            {testimonials2.map((t) => (
              <Tweet key={t.handle} t={t} />
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="lq-cta">
          <div className="lq-cta-grid" />
          <img
            src="/interstate/glass-bloom.webp"
            alt="Interstate glass bloom"
            className="lq-cta-bloom"
            loading="lazy"
          />
          <h2 className="lq-cta-title">
            <span className="lq-white">Start trading</span> with real power.
          </h2>
          <p className="lq-cta-sub">Join traders moving faster, paying less, and staying in full control.</p>
          <div className="lq-cta-buttons">
            <Link href="/" className="lq-cta-primary">
              Launch the web app <FaArrowUpRightFromSquare size={11} />
            </Link>
            <Link href="#" className="lq-cta-secondary">
              Launch in ChatGPT <SiOpenai size={14} />
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="lq-footer">
          <div className="lq-footer-logo">
            <Logo size={20} />
          </div>
          <div className="lq-footer-grid">
            {footerCols.map((col) => (
              <div key={col.title} className="lq-footer-col">
                <h4>{col.title}</h4>
                {col.groups.map((g) => (
                  <div key={g.h} className="lq-footer-group">
                    <span className="lq-footer-grouph">{g.h}</span>
                    {g.items.map((it) => (
                      <a key={it} href="#">
                        {it}
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            ))}
            <div className="lq-footer-col lq-footer-right">
              <h4>Company</h4>
              <div className="lq-footer-group">
                {companyLinks.map((l) => (
                  <a key={l} href="#">
                    {l}
                  </a>
                ))}
              </div>
            </div>
            <div className="lq-footer-col lq-footer-right">
              <h4>Social</h4>
              <div className="lq-footer-group">
                {socialLinks.map((l) => (
                  <a key={l} href="#">
                    {l}
                  </a>
                ))}
              </div>
            </div>
          </div>
          <div className="lq-footer-bottom">
            <span>© {new Date().getFullYear()} Liquid. All rights reserved.</span>
          </div>
        </footer>
      </div>

      <style jsx>{styles}</style>
      <style jsx global>{globalStyles}</style>
    </>
  );
}

/* ----------------------------- small pieces ----------------------------- */

function Check() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 0.5C3.41 0.5 0.5 3.41 0.5 7C0.5 10.59 3.41 13.5 7 13.5C10.59 13.5 13.5 10.59 13.5 7C13.5 3.41 10.59 0.5 7 0.5ZM5.75 10.25L2.5 7L3.4125 6.0875L5.75 8.4175L10.5875 3.58L11.5 4.5L5.75 10.25Z"
        fill="#18c48c"
      />
    </svg>
  );
}

type T = { name: string; handle: string; initial: string; color: string; text: string };

function Tweet({ t }: { t: T }) {
  return (
    <div className="lq-tweet">
      <div className="lq-tweet-head">
        <span className="lq-tweet-avatar" style={{ background: t.color }}>
          {t.initial}
        </span>
        <div className="lq-tweet-meta">
          <span className="lq-tweet-name">{t.name}</span>
          <span className="lq-tweet-handle">{t.handle}</span>
        </div>
        <FaXTwitter className="lq-tweet-x" size={14} />
      </div>
      <p className="lq-tweet-text">{t.text}</p>
    </div>
  );
}

const chartPath =
  "M0,90 L18,82 L36,86 L54,70 L72,74 L90,58 L108,64 L126,46 L144,52 L162,40 L180,44 L198,32 L216,36 L234,48 L252,42 L270,56 L288,50 L306,66 L324,60 L342,78 L360,72 L378,88 L396,82 L400,90";

function TradingMockup() {
  return (
    <div className="lq-mock-desktop">
      <div className="lq-mock-topbar">
        <Logo size={15} />
        <div className="lq-mock-tabs">
          <span className="active">Trade</span>
          <span>Predict</span>
          <span>Leaderboard</span>
          <span>Points</span>
          <span>Vault</span>
          <span>Referral</span>
        </div>
        <div className="lq-mock-ticker">
          <span><i style={{ background: "#e8c14a" }} /> GOLD <b className="red">-3.41%</b></span>
          <span><i style={{ background: "#4da2ff" }} /> EUR/USD <b className="green">+0.11%</b></span>
          <span><i style={{ background: "#3b82f6" }} /> NDX <b className="red">-1.38%</b></span>
          <span><i style={{ background: "#0a0a0a" }} /> OPENAI <b className="green">+0.13%</b></span>
          <span><i style={{ background: "#f7931a" }} /> BTC <b className="green">+0.97%</b></span>
        </div>
        <span className="lq-mock-login">Log in</span>
      </div>

      <div className="lq-mock-body">
        <div className="lq-mock-railsmall" />
        <div className="lq-mock-chart">
          <div className="lq-mock-chart-head">
            <span className="lq-mock-pair">
              <i style={{ background: "#e8c14a" }} /> GOLD · 1 · Liquid
            </span>
            <span className="lq-mock-ohlc">
              O4517.20 H4517.50 L4515.20 C4515.60 <b className="red">-1.70 (-0.04%)</b>
            </span>
          </div>
          <svg className="lq-mock-chart-svg" viewBox="0 0 400 120" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lqchart" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#18c48c" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#18c48c" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={chartPath} stroke="#18c48c" strokeWidth="1.6" fill="none" />
            <path d={`${chartPath} L400,120 L0,120 Z`} fill="url(#lqchart)" />
            <path
              d="M0,40 C100,42 200,30 300,26 C340,24 380,22 400,21"
              stroke="#c98b3c"
              strokeWidth="1.2"
              fill="none"
              opacity="0.7"
            />
          </svg>
          <div className="lq-mock-vol">
            {[...Array(40)].map((_, i) => (
              <span key={i} style={{ height: `${8 + ((i * 37) % 26)}px` }} className={i % 3 === 0 ? "red" : "green"} />
            ))}
          </div>
        </div>

        <div className="lq-mock-ob">
          <div className="lq-mock-ob-title">Order Book</div>
          {[...Array(7)].map((_, i) => (
            <div key={`s${i}`} className="lq-mock-ob-row sell">
              <span className="fill" style={{ width: `${25 + ((i * 53) % 55)}%` }} />
            </div>
          ))}
          <div className="lq-mock-ob-spread">4,515.05</div>
          {[...Array(7)].map((_, i) => (
            <div key={`b${i}`} className="lq-mock-ob-row buy">
              <span className="fill" style={{ width: `${25 + ((i * 41) % 55)}%` }} />
            </div>
          ))}
        </div>

        <div className="lq-mock-trade">
          <div className="lq-mock-trade-pair">
            <i style={{ background: "#e8c14a" }} /> Gold
          </div>
          <svg className="lq-mock-trade-spark" viewBox="0 0 120 50" preserveAspectRatio="none">
            <path d="M0,40 L20,38 L40,30 L60,34 L80,20 L100,24 L120,8" stroke="#18c48c" strokeWidth="1.5" fill="none" />
          </svg>
          <div className="lq-mock-trade-price">
            $4,415.15 <b className="green">+1.24% 5d</b>
          </div>
          <div className="lq-mock-trade-btn">Trade</div>
        </div>
      </div>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="lq-mock-phone">
      <div className="lq-mock-phone-notch" />
      <div className="lq-mock-phone-head">
        <i style={{ background: "#e8c14a" }} /> Gold
      </div>
      <svg className="lq-mock-phone-chart" viewBox="0 0 160 70" preserveAspectRatio="none">
        <path d="M0,55 L18,50 L36,54 L54,40 L72,44 L90,30 L108,34 L126,20 L144,24 L160,14" stroke="#18c48c" strokeWidth="1.6" fill="none" />
      </svg>
      <div className="lq-mock-phone-price">
        <span className="v">$4,561.05</span>
        <span className="c">+2.09% 1Y</span>
      </div>
      <div className="lq-mock-phone-stats">
        <div><span>24h Volume</span><b>$167.8M</b></div>
        <div><span>Max Multiplier</span><b>25x</b></div>
      </div>
    </div>
  );
}

function MiniTrading() {
  return (
    <div className="lq-mini">
      <div className="lq-mini-bar">
        <Logo size={12} />
        <span className="lq-mini-pair"><i style={{ background: "#e8c14a" }} /> GOLD</span>
      </div>
      <svg className="lq-mini-chart" viewBox="0 0 300 130" preserveAspectRatio="none">
        <defs>
          <linearGradient id="mini1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#18c48c" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#18c48c" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0,100 L30,92 L60,96 L90,72 L120,80 L150,56 L180,64 L210,40 L240,48 L270,28 L300,34" stroke="#18c48c" strokeWidth="1.6" fill="none" />
        <path d="M0,100 L30,92 L60,96 L90,72 L120,80 L150,56 L180,64 L210,40 L240,48 L270,28 L300,34 L300,130 L0,130 Z" fill="url(#mini1)" />
      </svg>
    </div>
  );
}

function MiniAssetList() {
  const rows = [
    { s: "BTC", p: "70,351", c: "-0.34%", up: false },
    { s: "XYZ100", p: "24,041", c: "-1.40%", up: false },
    { s: "GOLD", p: "4,503.8", c: "-3.51%", up: false },
    { s: "EUR", p: "1.1571", c: "-0.09%", up: false },
    { s: "OPENAI", p: "912.91", c: "-0.92%", up: false },
    { s: "ETH", p: "2,344.0", c: "-0.19%", up: false },
    { s: "SILVER", p: "68.081", c: "-6.40%", up: false },
    { s: "CL", p: "95.165", c: "+0.80%", up: true },
    { s: "HYPE", p: "39.374", c: "+0.59%", up: true },
    { s: "SOL", p: "89.421", c: "+0.46%", up: true },
  ];
  return (
    <div className="lq-mini lq-mini-list">
      <div className="lq-mini-search">Search for an asset</div>
      <div className="lq-mini-listhead">
        <span>Symbol</span>
        <span>Price</span>
        <span>24h</span>
      </div>
      {rows.map((r) => (
        <div key={r.s} className="lq-mini-listrow">
          <span className="lq-mini-sym">{r.s}</span>
          <span>{r.p}</span>
          <span className={r.up ? "green" : "red"}>{r.c}</span>
        </div>
      ))}
    </div>
  );
}

function MiniOrder() {
  return (
    <div className="lq-mock-phone lq-mini-order">
      <div className="lq-mock-phone-notch" />
      <div className="lq-mini-order-head">
        <span><i style={{ background: "#f7931a" }} /> BTC</span>
        <b>$70,570.00</b>
      </div>
      <div className="lq-mini-order-side">
        <span className="long">Long</span>
        <span className="short">Short</span>
      </div>
      <div className="lq-mini-order-tabs">
        <span className="active">Market</span>
        <span>Limit</span>
        <span>TWAP</span>
      </div>
      <div className="lq-mini-order-field">
        <span>Size</span>
        <b>$167,710.10</b>
      </div>
      <div className="lq-mini-order-field">
        <span>Amount</span>
        <b>$24.00</b>
      </div>
      <div className="lq-mini-order-btn">Long BTC</div>
    </div>
  );
}

/* ----------------------------- styles ----------------------------- */

const globalStyles = `
  html, body { background: #050506; }
`;

const styles = `
  .lq-root {
    --bg: #050506;
    --panel: #0b0c0f;
    --panel-2: #0e1014;
    --line: rgba(255,255,255,0.08);
    --line-soft: rgba(255,255,255,0.05);
    --text: #ededf0;
    --muted: #8a8a93;
    --muted-2: #5f5f68;
    --green: #18c48c;
    --red: #f0616d;
    background: var(--bg);
    color: var(--text);
    font-family: "Inter", "Geist", system-ui, -apple-system, sans-serif;
    overflow-x: hidden;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }
  .lq-root a { color: inherit; text-decoration: none; }
  .lq-white { color: var(--text); }

  /* banner */
  .lq-banner {
    text-align: center;
    font-size: 13px;
    color: var(--muted);
    padding: 10px 16px;
    background: linear-gradient(180deg, rgba(20,40,80,0.45), rgba(8,10,16,0.2));
    border-bottom: 1px solid var(--line-soft);
  }
  .lq-banner-link { color: var(--text); font-weight: 600; text-decoration: underline; display: inline-flex; align-items: center; gap: 5px; }

  /* nav */
  .lq-nav {
    position: sticky; top: 0; z-index: 50;
    backdrop-filter: blur(12px);
    background: rgba(5,5,6,0.72);
    border-bottom: 1px solid var(--line-soft);
  }
  .lq-nav-inner {
    max-width: 1240px; margin: 0 auto;
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 32px;
  }
  .lq-nav-links { display: flex; gap: 30px; font-size: 15px; }
  .lq-nav-links a { color: var(--text); transition: color .15s; }
  .lq-nav-links a:hover { color: #fff; }
  .lq-nav-links a.muted { color: var(--muted-2); }
  .lq-nav-cta {
    display: inline-flex; align-items: center; gap: 8px;
    background: #3e9079; color: #ffffff;
    padding: 9px 18px; border-radius: 10px;
    font-size: 14px; font-weight: 600;
    transition: transform .15s, background .15s;
  }
  .lq-nav-cta:hover { background: #449e84; }

        .lq-logo { display: inline-flex; align-items: center; gap: 8px; }
        .lq-logo-mark { display: inline-block; object-fit: contain; border-radius: 50%; flex-shrink: 0; }
        .lq-logo-text { font-family: "Orbitron", var(--font-sans, sans-serif); font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; line-height: 1; text-shadow: 0 0 20px rgba(24, 196, 140, 0.2); }

  /* hero */
  .lq-hero { text-align: center; padding: 70px 24px 30px; max-width: 900px; margin: 0 auto; }
  .lq-hero-title {
    font-size: clamp(34px, 5.5vw, 58px);
    font-weight: 600; line-height: 1.08; letter-spacing: -0.025em; margin: 0;
  }
  .lq-hero-badges { display: flex; justify-content: center; flex-wrap: wrap; gap: 22px; margin: 26px 0 30px; }
  .lq-badge { display: inline-flex; align-items: center; gap: 7px; font-size: 14px; color: var(--muted); }
  .lq-hero-cta {
    display: inline-flex; align-items: center; gap: 9px;
    background: #3e9079; color: #ffffff;
    padding: 13px 26px; border-radius: 12px; font-size: 15px; font-weight: 600;
    transition: transform .15s, background .15s;
  }
  .lq-hero-cta:hover { transform: translateY(-1px); background: #449e84; }

  /* product */
  .lq-product { position: relative; max-width: 1160px; margin: 30px auto 0; padding: 0 24px 60px; }
  .lq-product-glow {
    position: absolute; top: 0; left: 50%; transform: translateX(-50%);
    width: 700px; height: 380px;
    background: radial-gradient(ellipse, rgba(24,196,140,0.10), transparent 70%);
    pointer-events: none;
  }

  .lq-app-shot {
    position: relative; z-index: 1; width: 100%;
    border: 1px solid var(--line); border-radius: 12px; overflow: hidden;
    background: #08090c;
    box-shadow: 0 30px 80px rgba(0,0,0,0.65);
  }
  .lq-app-shot img { display: block; width: 100%; height: auto; }

  .lq-mock-desktop {
    position: relative; z-index: 1; width: 100%;
    border: 1px solid var(--line); border-radius: 12px; overflow: hidden;
    background: #08090c;
    box-shadow: 0 30px 80px rgba(0,0,0,0.65);
  }
  .lq-mock-topbar {
    display: flex; align-items: center; gap: 16px;
    padding: 9px 14px; border-bottom: 1px solid var(--line-soft);
    background: #0a0b0e; font-size: 11px;
  }
  .lq-mock-tabs { display: flex; gap: 14px; color: var(--muted); }
  .lq-mock-tabs .active { color: var(--text); }
  .lq-mock-ticker { display: flex; gap: 14px; margin-left: auto; color: var(--muted); overflow: hidden; }
  .lq-mock-ticker span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .lq-mock-ticker i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
  .lq-mock-login { font-size: 11px; color: var(--text); }
  .red { color: var(--red); } .green { color: var(--green); }

  .lq-mock-body { display: grid; grid-template-columns: 14px 1fr 150px 150px; min-height: 300px; }
  .lq-mock-railsmall { background: #0a0b0e; border-right: 1px solid var(--line-soft); }
  .lq-mock-chart { padding: 12px; display: flex; flex-direction: column; border-right: 1px solid var(--line-soft); }
  .lq-mock-chart-head { display: flex; justify-content: space-between; font-size: 10px; color: var(--muted); margin-bottom: 8px; flex-wrap: wrap; gap: 6px; }
  .lq-mock-pair { display: inline-flex; align-items: center; gap: 6px; color: var(--text); }
  .lq-mock-pair i, .lq-mock-trade-pair i, .lq-mock-phone-head i, .lq-mini-pair i, .lq-mini-order-head i { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
  .lq-mock-chart-svg { flex: 1; width: 100%; min-height: 170px; }
  .lq-mock-vol { display: flex; align-items: flex-end; gap: 2px; height: 30px; margin-top: 4px; }
  .lq-mock-vol span { flex: 1; border-radius: 1px; opacity: 0.5; }
  .lq-mock-vol span.red { background: var(--red); }
  .lq-mock-vol span.green { background: var(--green); }

  .lq-mock-ob { padding: 10px 8px; font-size: 9px; border-right: 1px solid var(--line-soft); background: #0a0b0e; display: flex; flex-direction: column; gap: 2px; }
  .lq-mock-ob-title { color: var(--muted); margin-bottom: 6px; }
  .lq-mock-ob-row { position: relative; height: 13px; border-radius: 2px; overflow: hidden; }
  .lq-mock-ob-row .fill { position: absolute; right: 0; top: 0; height: 100%; }
  .lq-mock-ob-row.sell .fill { background: rgba(240,97,109,0.16); }
  .lq-mock-ob-row.buy .fill { background: rgba(24,196,140,0.16); }
  .lq-mock-ob-spread { color: var(--text); font-weight: 600; padding: 5px 0; font-size: 11px; }

  .lq-mock-trade { padding: 12px; background: #0a0b0e; display: flex; flex-direction: column; gap: 10px; }
  .lq-mock-trade-pair { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
  .lq-mock-trade-spark { width: 100%; height: 50px; }
  .lq-mock-trade-price { font-size: 13px; font-weight: 600; }
  .lq-mock-trade-price b { font-size: 10px; font-weight: 600; margin-left: 4px; }
  .lq-mock-trade-btn { margin-top: auto; text-align: center; background: #fafafa; color: #0a0a0a; border-radius: 8px; padding: 9px; font-size: 12px; font-weight: 600; }

  /* phone */
  .lq-mock-phone {
    position: absolute; right: 36px; bottom: 18px; z-index: 3;
    width: 176px; background: #0c0e12;
    border: 1px solid rgba(255,255,255,0.12); border-radius: 22px; padding-bottom: 14px;
    box-shadow: 0 24px 50px rgba(0,0,0,0.6); overflow: hidden;
  }
  .lq-mock-phone-notch { width: 56px; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.14); margin: 10px auto 0; }
  .lq-mock-phone-head { display: flex; align-items: center; gap: 7px; padding: 12px 16px 2px; font-weight: 600; font-size: 14px; }
  .lq-mock-phone-chart { width: 100%; height: 56px; padding: 6px 0; }
  .lq-mock-phone-price { padding: 2px 16px 8px; }
  .lq-mock-phone-price .v { font-size: 18px; font-weight: 700; }
  .lq-mock-phone-price .c { font-size: 11px; color: var(--green); margin-left: 8px; }
  .lq-mock-phone-stats { display: flex; gap: 8px; padding: 0 16px; }
  .lq-mock-phone-stats div { flex: 1; background: rgba(255,255,255,0.03); border-radius: 8px; padding: 7px 9px; display: flex; flex-direction: column; gap: 3px; }
  .lq-mock-phone-stats span { font-size: 9px; color: var(--muted); }
  .lq-mock-phone-stats b { font-size: 12px; }

  /* press */
  .lq-press { border-top: 1px solid var(--line-soft); border-bottom: 1px solid var(--line-soft); padding: 26px 24px; }
  .lq-press-row { max-width: 1240px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
  .lq-press-item { font-size: 19px; font-weight: 700; letter-spacing: 0.01em; color: #e6e6ea; opacity: 0.85; }

  /* sections */
  .lq-section { max-width: 1240px; margin: 0 auto; padding: 90px 32px; }
  .lq-h2 { font-size: clamp(26px, 3.6vw, 42px); font-weight: 500; line-height: 1.18; letter-spacing: -0.02em; color: var(--muted-2); margin: 0 0 36px; max-width: 920px; }
  .lq-h2-lg { font-size: clamp(28px, 4vw, 46px); }
  .lq-inline-icon { display: inline-flex; align-items: center; justify-content: center; width: 1.05em; height: 1.05em; border-radius: 50%; font-size: 0.7em; font-weight: 700; vertical-align: -0.16em; }

  /* markets */
  .lq-markets-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
  .lq-tabs { display: inline-flex; background: rgba(255,255,255,0.04); border: 1px solid var(--line-soft); border-radius: 999px; padding: 4px; flex-shrink: 0; }
  .lq-tabs button { border: 0; background: transparent; color: var(--muted); font-size: 14px; padding: 7px 18px; border-radius: 999px; cursor: pointer; }
  .lq-tabs button.active { background: #1a1b1f; color: var(--text); }
  .lq-marquees { display: flex; flex-direction: column; gap: 14px; margin-top: 8px; }
  .lq-marquee { overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
  .lq-marquee-track { display: flex; gap: 12px; width: max-content; animation: lqscroll 48s linear infinite; }
  .lq-marquee-track.rev { animation-direction: reverse; }
  @keyframes lqscroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  .lq-pill { display: inline-flex; align-items: center; gap: 10px; background: var(--panel); border: 1px solid var(--line-soft); border-radius: 999px; padding: 8px 18px 8px 8px; flex-shrink: 0; }
  .lq-pill-icon { width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
  .lq-pill-icon :global(svg) { width: 16px; height: 16px; }
  .lq-pill-text { display: flex; flex-direction: column; line-height: 1.15; }
  .lq-pill-name { font-size: 14px; font-weight: 600; color: var(--text); }
  .lq-pill-sym { font-size: 11px; color: var(--muted); }

  /* three columns */
  .lq-three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .lq-three-col { border: 1px solid var(--line-soft); border-radius: 16px; padding: 28px; background: var(--panel); }
  .lq-step { font-size: 13px; color: var(--green); font-weight: 700; letter-spacing: 0.06em; }
  .lq-three-col h3 { font-size: 20px; font-weight: 600; margin: 12px 0 8px; }
  .lq-three-col p { font-size: 15px; color: var(--muted); line-height: 1.55; margin: 0; }

  /* showcase */
  .lq-showcase { display: grid; grid-template-columns: 1.3fr 1.2fr 0.7fr; gap: 18px; align-items: stretch; }
  .lq-showcase-card { background: var(--panel); border: 1px solid var(--line-soft); border-radius: 16px; overflow: hidden; min-height: 360px; position: relative; }
  .lq-showcase-phone { background: transparent; border: 0; display: flex; align-items: center; justify-content: center; }

  .lq-mini { padding: 12px; height: 100%; display: flex; flex-direction: column; }
  .lq-mini-bar { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--muted); margin-bottom: 8px; }
  .lq-mini-pair { display: inline-flex; align-items: center; gap: 6px; color: var(--text); }
  .lq-mini-chart { flex: 1; width: 100%; }
  .lq-mini-list { font-size: 11px; }
  .lq-mini-search { background: rgba(255,255,255,0.04); border: 1px solid var(--line-soft); border-radius: 8px; padding: 8px 10px; color: var(--muted); margin-bottom: 10px; }
  .lq-mini-listhead, .lq-mini-listrow { display: grid; grid-template-columns: 1.2fr 1fr 1fr; padding: 6px 4px; }
  .lq-mini-listhead { color: var(--muted-2); border-bottom: 1px solid var(--line-soft); }
  .lq-mini-listrow { border-bottom: 1px solid var(--line-soft); }
  .lq-mini-sym { color: var(--text); font-weight: 600; }
  .lq-mini-listrow span:not(.lq-mini-sym) { text-align: right; }
  .lq-mini-listhead span:not(:first-child) { text-align: right; }

  .lq-mini-order { position: relative; right: auto; bottom: auto; width: 200px; box-shadow: 0 24px 50px rgba(0,0,0,0.5); }
  .lq-mini-order-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px 6px; font-size: 13px; }
  .lq-mini-order-head span { display: inline-flex; align-items: center; gap: 6px; }
  .lq-mini-order-side { display: flex; gap: 8px; padding: 4px 14px; }
  .lq-mini-order-side span { flex: 1; text-align: center; padding: 7px; border-radius: 8px; font-size: 12px; font-weight: 600; border: 1px solid var(--line-soft); }
  .lq-mini-order-side .long { color: var(--green); border-color: rgba(24,196,140,0.4); }
  .lq-mini-order-side .short { color: var(--muted); }
  .lq-mini-order-tabs { display: flex; gap: 4px; padding: 10px 14px 6px; font-size: 11px; }
  .lq-mini-order-tabs span { flex: 1; text-align: center; padding: 5px; border-radius: 6px; color: var(--muted); }
  .lq-mini-order-tabs .active { background: rgba(255,255,255,0.06); color: var(--text); }
  .lq-mini-order-field { display: flex; justify-content: space-between; padding: 7px 14px; font-size: 11px; color: var(--muted); }
  .lq-mini-order-field b { color: var(--text); }
  .lq-mini-order-btn { margin: 8px 14px 0; text-align: center; background: var(--green); color: #04130d; border-radius: 8px; padding: 9px; font-size: 12px; font-weight: 700; }

  /* features */
  .lq-features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; padding-top: 0; }
  .lq-feature { border: 1px solid var(--line-soft); border-radius: 16px; background: var(--panel); min-height: 240px; overflow: hidden; position: relative; }
  .lq-feature-news { padding: 18px; }
  .lq-feature-h { font-size: 18px; font-weight: 600; }
  .lq-news-card { margin-top: 16px; background: rgba(255,255,255,0.03); border: 1px solid var(--line-soft); border-radius: 12px; padding: 14px; }
  .lq-news-row { display: flex; align-items: center; gap: 10px; }
  .lq-news-avatar { width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; }
  .lq-news-name { font-size: 13px; font-weight: 600; }
  .lq-news-src { font-size: 11px; color: var(--muted); }
  .lq-news-time { margin-left: auto; font-size: 11px; color: var(--muted); }
  .lq-news-card p { font-size: 12.5px; color: var(--muted); line-height: 1.5; margin: 12px 0 0; }

  .lq-feature-apy { display: flex; align-items: flex-end; }
  .lq-apy-curve { position: absolute; inset: 0; width: 100%; height: 100%; }
  .lq-apy-label { position: relative; padding: 22px; }
  .lq-apy-num { font-size: 52px; font-weight: 700; }
  .lq-apy-unit { font-size: 22px; color: var(--muted); margin-left: 8px; }
  .lq-apy-note { display: block; font-size: 11px; color: var(--muted-2); margin-top: 6px; }

  .lq-feature-profile { padding: 18px; }
  .lq-profile-head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
  .lq-profile-avatar { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg,#444,#222); }
  .lq-profile-name { font-size: 14px; font-weight: 600; }
  .lq-profile-following { font-size: 10px; color: var(--muted); border: 1px solid var(--line-soft); border-radius: 999px; padding: 2px 8px; display: inline-block; margin-top: 3px; }
  .lq-profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .lq-profile-stat { background: rgba(255,255,255,0.03); border: 1px solid var(--line-soft); border-radius: 10px; padding: 10px 12px; }
  .lq-profile-stat-label { display: block; font-size: 10px; color: var(--muted); margin-bottom: 5px; }
  .lq-profile-stat-val { font-size: 13px; font-weight: 600; }

  /* trusted / tweets */
  .lq-trusted-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 36px; flex-wrap: wrap; }
  .lq-trusted-sub { color: var(--muted); margin: 8px 0 0; font-size: 15px; }
  .lq-follow { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 999px; padding: 10px 18px; font-size: 14px; }
  .lq-follow:hover { background: rgba(255,255,255,0.04); }
  .lq-tweets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .lq-tweets-2 { margin-top: 16px; }
  .lq-tweet { border: 1px solid var(--line-soft); border-radius: 14px; background: var(--panel); padding: 16px; }
  .lq-tweet-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .lq-tweet-avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0; }
  .lq-tweet-meta { display: flex; flex-direction: column; line-height: 1.2; }
  .lq-tweet-name { font-size: 13px; font-weight: 600; }
  .lq-tweet-handle { font-size: 12px; color: var(--muted); }
  .lq-tweet-x { margin-left: auto; color: var(--muted); }
  .lq-tweet-text { font-size: 13.5px; color: #c9c9d0; line-height: 1.55; margin: 0; }

  /* cta */
  .lq-cta { position: relative; text-align: center; padding: 120px 24px; overflow: hidden; border-top: 1px solid var(--line-soft); }
  .lq-cta-grid { position: absolute; inset: 0; background:
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px) 0 0 / 100% 64px,
    radial-gradient(ellipse at 50% 120%, rgba(24,196,140,0.06), transparent 60%);
    -webkit-mask-image: radial-gradient(ellipse at 50% 60%, #000, transparent 75%);
    mask-image: radial-gradient(ellipse at 50% 60%, #000, transparent 75%);
    pointer-events: none; }
  .lq-cta-bloom { position: relative; display: block; width: clamp(180px, 26vw, 280px); height: auto; margin: 0 auto 28px; filter: drop-shadow(0 24px 60px rgba(24,196,140,0.28)); }
  .lq-cta-title { position: relative; font-size: clamp(34px, 6vw, 64px); font-weight: 600; letter-spacing: -0.025em; color: var(--muted-2); margin: 0; }
  .lq-cta-sub { position: relative; color: var(--muted); font-size: 17px; margin: 18px 0 32px; }
  .lq-cta-buttons { position: relative; display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
  .lq-cta-primary { display: inline-flex; align-items: center; gap: 8px; background: #3e9079; color: #ffffff; padding: 14px 26px; border-radius: 999px; font-size: 15px; font-weight: 600; }
  .lq-cta-secondary { display: inline-flex; align-items: center; gap: 8px; background: #161719; color: var(--text); border: 1px solid var(--line); padding: 14px 26px; border-radius: 999px; font-size: 15px; font-weight: 600; }
  .lq-cta-primary:hover, .lq-cta-secondary:hover { transform: translateY(-1px); }

  /* footer */
  .lq-footer { border-top: 1px solid var(--line-soft); padding: 56px 32px 36px; max-width: 1240px; margin: 0 auto; }
  .lq-footer-logo { margin-bottom: 40px; }
  .lq-footer-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 0.7fr 0.7fr; gap: 32px; }
  .lq-footer-col h4 { font-size: 15px; font-weight: 600; margin: 0 0 18px; }
  .lq-footer-right { text-align: right; }
  .lq-footer-group { display: flex; flex-direction: column; gap: 9px; margin-bottom: 20px; }
  .lq-footer-grouph { font-size: 11px; letter-spacing: 0.08em; color: var(--muted-2); margin-bottom: 2px; }
  .lq-footer-group a { font-size: 14px; color: var(--muted); }
  .lq-footer-group a:hover { color: var(--text); }
  .lq-footer-bottom { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--line-soft); font-size: 13px; color: var(--muted-2); }

  /* responsive */
  @media (max-width: 960px) {
    .lq-nav-links { display: none; }
    .lq-three, .lq-features, .lq-showcase { grid-template-columns: 1fr; }
    .lq-tweets { grid-template-columns: 1fr 1fr; }
    .lq-footer-grid { grid-template-columns: 1fr 1fr; }
    .lq-footer-right { text-align: left; }
    .lq-mock-phone { display: none; }
    .lq-mock-body { grid-template-columns: 10px 1fr 110px; }
    .lq-mock-trade { display: none; }
  }
  @media (max-width: 600px) {
    .lq-section { padding: 60px 20px; }
    .lq-tweets { grid-template-columns: 1fr; }
    .lq-footer-grid { grid-template-columns: 1fr; }
    .lq-mock-ticker, .lq-mock-tabs { display: none; }
    .lq-mock-body { grid-template-columns: 1fr 90px; }
    .lq-mock-railsmall { display: none; }
    .lq-press-item { font-size: 15px; }
  }
`;
