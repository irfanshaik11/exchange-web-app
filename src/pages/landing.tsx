import Head from "next/head";
import Link from "next/link";
import LandingHeader from '~/components/layout/LandingHeader';
import { ArrowRight, ArrowUpRight, UserPlus, Cpu, KeyRound, BadgeCheck, Server } from 'lucide-react';
import SimpleMarquee from '~/components/marquee/SimpleMarquee';
import MarketsMarquee from '~/components/marquee/MarketsMarquee';
import { FaXTwitter } from "react-icons/fa6";
import { SiClaude } from "react-icons/si";
import TweetCard from '~/components/cards/tweet-card';
import LandingFooter from '~/components/layout/footer/LandingFooter';

/* ----------------------------- data ----------------------------- */

const testimonials = [
  { id: "2032596038352252962" },
  { id: "2067885952081834364" },
  { id: "2067921762197868814" },
  { id: "2066467204070293555" },
  { id: "2029347157057085809" },
  { id: "1900579320977850626" },
  { id: "2067207103043817897" },
  { id: "2066802889452872170" },
];

const press = [
  // All logos render at the same height (set on the link below).
  { name: "Apple News", src: "/static/icons/brand_logos/apple-news.webp", href: "#" },
  { name: "Business Insider", src: "/static/icons/brand_logos/business-insider.webp", href: "#" },
  { name: "USA Today", src: "/static/icons/brand_logos/usa-today.webp", href: "#" },
];

// Cap how many testimonial cards show at each grid width so rows stay balanced:
// 1 col → 3 cards, 2 cols → 4, 3 cols (md–xl) → 6, 4 cols (2xl) → 8. Each card
// past the first three reveals at the first breakpoint that has room for it.
function testimonialVisibility(i: number): string {
  if (i < 3) return "";                 // always visible (1 col shows 3)
  if (i < 4) return "hidden sm:block";  // 2 cols shows 4
  if (i < 6) return "hidden md:block";  // 3 cols shows 6
  return "hidden 2xl:block";            // 4 cols shows 8
}

/* ----------------------------- components ----------------------------- */

function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img
        src="/interstate/logo.webp"
        alt="Interstate logo"
        className="inline-block object-contain rounded-full shrink-0"
        style={{ width: size + 6, height: size + 6 }}
      />
      <span
        className="font-semibold tracking-[0.12em] uppercase leading-none text-[#ededf0]"
        style={{ fontSize: size * 0.82, fontFamily: "'Orbitron', sans-serif" }}
      >
        interstate
      </span>
    </span>
  );
}

// OHLC candles (arbitrary price units): tight consolidation then a sharp
// breakout → renders as a mini candlestick chart inside the "See it" card.
const WIF_CANDLES = [
  { o: 50, c: 49, h: 52, l: 48 },
  { o: 49, c: 51, h: 53, l: 47 },
  { o: 51, c: 50, h: 53, l: 49 },
  { o: 50, c: 48, h: 52, l: 47 },
  { o: 48, c: 51, h: 52, l: 46 },
  { o: 51, c: 49, h: 53, l: 48 },
  { o: 49, c: 52, h: 54, l: 48 },
  { o: 52, c: 50, h: 54, l: 49 },
  { o: 50, c: 53, h: 55, l: 49 },
  { o: 53, c: 58, h: 60, l: 52 },
  { o: 58, c: 66, h: 68, l: 57 },
  { o: 66, c: 63, h: 69, l: 62 },
  { o: 63, c: 74, h: 76, l: 62 },
  { o: 74, c: 82, h: 85, l: 73 },
  { o: 82, c: 79, h: 88, l: 78 },
  { o: 79, c: 90, h: 93, l: 78 },
];

function MiniTrading() {
  const W = 328;
  const H = 152;
  const pad = 14;
  const slot = W / WIF_CANDLES.length;
  const bodyW = slot * 0.52;
  const minV = Math.min(...WIF_CANDLES.map((d) => d.l));
  const maxV = Math.max(...WIF_CANDLES.map((d) => d.h));
  const yOf = (v: number) => pad + ((maxV - v) / (maxV - minV)) * (H - pad * 2);
  const xOf = (i: number) => i * slot + slot / 2;
  const UP = "#18c48c";
  const DOWN = "#f0616d";
  const lastY = yOf(WIF_CANDLES[WIF_CANDLES.length - 1].c);

  return (
    <div className="flex h-full flex-col p-4">
      {/* header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-[#231706]"
            style={{ background: "#e8b98a" }}
          >
            WIF
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold text-[#ededf0]">
              WIF<span className="text-[#5f5f68]">/USD</span>
            </div>
            <div className="text-[11px] text-[#8a8a93]">dogwifhat</div>
          </div>
        </div>
        <div className="text-right leading-tight">
          <div className="text-[15px] font-semibold text-[#ededf0]">$1.8420</div>
          <div className="text-[11px] font-semibold text-[#18c48c]">▲ 5.12%</div>
        </div>
      </div>

      {/* candlestick chart */}
      <div className="relative mt-3 flex-1">
        <div className="pointer-events-none absolute bottom-1.5 left-0.5 opacity-[0.06]">
          <Logo size={12} />
        </div>
        <svg className="h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {/* faint horizontal grid */}
          {[0, 1, 2, 3].map((i) => {
            const gy = pad + (i / 3) * (H - pad * 2);
            return <line key={i} x1="0" y1={gy} x2={W} y2={gy} stroke="#ffffff" strokeOpacity="0.045" strokeWidth="1" />;
          })}
          {/* candles */}
          {WIF_CANDLES.map((d, i) => {
            const color = d.c >= d.o ? UP : DOWN;
            const cx = xOf(i);
            const top = yOf(Math.max(d.o, d.c));
            const bottom = yOf(Math.min(d.o, d.c));
            return (
              <g key={i}>
                <line x1={cx} y1={yOf(d.h)} x2={cx} y2={yOf(d.l)} stroke={color} strokeWidth="1.1" />
                <rect x={cx - bodyW / 2} y={top} width={bodyW} height={Math.max(bottom - top, 1.5)} rx="1.2" fill={color} />
              </g>
            );
          })}
          {/* current price line */}
          <line x1="0" y1={lastY} x2={W} y2={lastY} stroke={UP} strokeWidth="1" strokeDasharray="2 3" strokeOpacity="0.7" />
        </svg>
        {/* current price tag */}
        <div
          className="absolute right-0 -translate-y-1/2 rounded bg-[#18c48c] px-1.5 py-[3px] text-[10px] font-bold text-[#04130d]"
          style={{ top: `${(lastY / H) * 100}%` }}
        >
          1.8420
        </div>
      </div>

      {/* timeframe row */}
      <div className="mt-3 flex items-center gap-1">
        {["1m", "5m", "15m", "1H", "4H"].map((t, i) => (
          <span
            key={t}
            className={`rounded-md px-2 py-1 text-[10px] font-medium ${i === 1 ? "bg-white/[0.08] text-[#ededf0]" : "text-[#5f5f68]"
              }`}
          >
            {t}
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-medium text-[#8a8a93]">
          <i className="h-1.5 w-1.5 rounded-full bg-[#18c48c]" />
          Live
        </span>
      </div>
    </div>
  );
}

function MiniAssetList() {
  const rows = [
    { s: "WIF", p: "1.8420", c: "+5.12%", up: true },
    { s: "DOGE", p: "0.1623", c: "+2.41%", up: true },
    { s: "PENGU", p: "0.0182", c: "+8.04%", up: true },
    { s: "POPCAT", p: "0.4210", c: "-1.30%", up: false },
    { s: "BONK", p: "0.000023", c: "-2.80%", up: false },
    { s: "PNUT", p: "0.1840", c: "-0.92%", up: false },
    { s: "BRETT", p: "0.0451", c: "+3.20%", up: true },
    { s: "FLOKI", p: "0.00012", c: "-2.10%", up: false },
    { s: "MEW", p: "0.0079", c: "+0.59%", up: true },
    { s: "TURBO", p: "0.0061", c: "+1.80%", up: true },
  ];
  return (
    <div className="p-3 h-full flex flex-col text-[11px]">
      <div className="bg-white/[0.04] border border-white/5 rounded-lg px-2.5 py-2 text-[#8a8a93] mb-2.5">
        Search for a coin
      </div>
      <div className="grid grid-cols-[1.2fr_1fr_1fr] px-1 py-1.5 text-[#5f5f68] border-b border-white/5">
        <span>Symbol</span>
        <span className="text-right">Price</span>
        <span className="text-right">24h</span>
      </div>
      {rows.map((r) => (
        <div key={r.s} className="grid grid-cols-[1.2fr_1fr_1fr] px-1 py-1.5 border-b border-white/5 text-[#8a8a93]">
          <span className="text-[#ededf0] font-semibold">{r.s}</span>
          <span className="text-right">{r.p}</span>
          <span className={`text-right ${r.up ? "text-[#18c48c]" : "text-[#f0616d]"}`}>{r.c}</span>
        </div>
      ))}
    </div>
  );
}

function MiniOrder() {
  return (
    <div className="relative w-full bg-[#0c0e12] border border-white/[0.12] rounded-[22px] pb-3.5 shadow-[0_24px_50px_rgba(0,0,0,0.5)] overflow-hidden">
      <div className="w-14 h-[5px] rounded-full bg-white/[0.14] mx-auto mt-2.5" />
      <div className="flex items-center justify-between px-3.5 pt-3 pb-1.5 text-[13px] text-[#ededf0]">
        <span className="inline-flex items-center gap-1.5">
          <i className="w-3 h-3 rounded-full inline-block" style={{ background: "#e8b98a" }} />
          WIF
        </span>
        <b>$1.8420</b>
      </div>
      <div className="flex gap-2 px-3.5 py-1">
        <span className="flex-1 text-center py-[7px] rounded-lg text-[12px] font-semibold border border-[rgba(24,196,140,0.4)] text-[#18c48c]">Buy</span>
        <span className="flex-1 text-center py-[7px] rounded-lg text-[12px] font-semibold border border-white/5 text-[#8a8a93]">Sell</span>
      </div>
      <div className="flex gap-1 px-3.5 pt-2.5 pb-1.5 text-[11px]">
        <span className="flex-1 text-center py-[5px] rounded-md bg-white/[0.06] text-[#ededf0]">Market</span>
        <span className="flex-1 text-center py-[5px] rounded-md text-[#8a8a93]">Limit</span>
        <span className="flex-1 text-center py-[5px] rounded-md text-[#8a8a93]">Snipe</span>
      </div>
      <div className="flex justify-between px-3.5 py-[7px] text-[11px] text-[#8a8a93]">
        <span>Pay</span>
        <b className="text-[#ededf0]">$24.00</b>
      </div>
      <div className="flex justify-between px-3.5 py-[7px] text-[11px] text-[#8a8a93]">
        <span>Receive</span>
        <b className="text-[#ededf0]">13.03 WIF</b>
      </div>
      <div className="mx-3.5 mt-2 text-center bg-[#18c48c] text-[#04130d] rounded-lg py-[9px] text-[12px] font-bold">
        Buy WIF
      </div>
    </div>
  );
}

/* ----------------------------- page ----------------------------- */

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
        <section className='relative flex flex-col items-center justify-center flex-1 h-screen w-full overflow-hidden bg-[#000]'>
          <video
            aria-hidden="true"
            autoPlay
            loop
            muted
            playsInline
            poster="/videos/landing_hero_poster.jpg"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          >
            <source src="/videos/landing_hero_f1-half.av1.webm" type='video/webm; codecs="av01.0.08M.08"' />
            <source src="/videos/landing_hero_f1-half.webm" type='video/webm; codecs="vp9"' />
            <source src="/videos/landing_hero_f1-half.mp4" type="video/mp4" />
          </video>
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at center, transparent 0%, transparent 55%, rgba(0,0,0,0.6) 85%, rgba(0,0,0,0.9) 100%)" }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at center, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0.88) 80%, rgba(0,0,0,1) 100%)",
              animation: "vignette-pulse 4s ease-in-out infinite",
            }}
          />
          <div className="relative z-10 flex flex-col items-center gap-5 lg:gap-8">
            <div className="flex flex-col gap-2 items-center text-center pt-10 px-2 mt-12 md:mt-0 md:px-6 lg:pt-20">
              <h1 className='text-5xl mb-56 md:text-9xl text-white !font-bold uppercase'>Interstate</h1>
              <h1 className="text-[24px] leading-6 lg:text-[40px] text-[#EAEDFF] text-center lg:leading-12 tracking-tighter">
                The Fastest Trading.
              </h1>
              <p className="lg:text-[22px] text-[#EAEDFF] text-center lg:leading-6 tracking-tight">
                Trade Memecoins, Trending and Newly Launched tokens At Light speed. Discover Prediction Markets, Perps and More.
              </p>
            </div>
            <div className="flex gap-2 lg:hidden w-full justify-center px-8">
              <Link
                href="/pulse"
                className="text-center z-2 bg-white/12 w-full backdrop-blur-md border border-bg-tertiary rounded-xl text-lg font-bold md:w-50 py-3"
              >
                Sign up
              </Link>
            </div>
            <div className="hidden lg:flex gap-3">
              <Link href="/pulse" className="group relative flex items-center justify-center overflow-hidden bg-[#04977c] hover:bg-[#037f68] transition-all duration-300 py-3 w-50 h-13 rounded-xl text-lg font-bold shadow-sm text-white z-10 cursor-pointer">
                <div className="flex items-center justify-center gap-1.5 translate-x-3 group-hover:translate-x-0 transition-transform duration-300 ease-out">
                  <span>Start trading</span>
                  <ArrowRight className="size-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 ease-out shrink-0" />
                </div>
              </Link>
              <Link href="/pulse" className="group relative flex items-center justify-center overflow-hidden bg-white/12 hover:bg-white/20 backdrop-blur-md transition-all duration-300 border border-white/10 rounded-xl text-lg font-bold w-50 h-13 z-10 cursor-pointer">
                <div className="flex items-center justify-center gap-1.5 -translate-x-3 group-hover:translate-x-0 transition-transform duration-300 ease-out">
                  <UserPlus className="size-5 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 ease-out shrink-0" />
                  <span>Sign up</span>
                </div>
              </Link>
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-0 left-0 w-full h-16 z-10 bg-gradient-to-t from-black to-transparent" />
          <div className="absolute bottom-0 w-full overflow-hidden py-6">
            <div className="pointer-events-none absolute left-0 top-0 z-20 h-full w-5 sm:w-10 lg:w-16 bg-gradient-to-r from-black via-black/80 to-transparent" />
            <div className="pointer-events-none absolute right-0 top-0 z-20 h-full w-5 sm:w-10 lg:w-16 bg-gradient-to-l from-black via-black/80 to-transparent" />
            <SimpleMarquee forceWhite={true} />
          </div>

          <Link href="/pulse" className="landing-cta-lg">
            Start trading <FaArrowRight className="landing-cta-arrow" />
          </Link>
        </section>

        {/* Content sections */}
        <section className="px-2.5 md:px-8 lg:px-16 xl:px-24">
          <MarketsMarquee />

          {/* Predictions simplified */}
          <div className="py-[60px] md:py-[90px] border-t border-white/5">
            <h2 className="text-[clamp(28px,4vw,46px)] font-medium leading-[1.12] tracking-[-0.02em] text-[#5f5f68] mb-10 max-w-[920px]">
              <span className="text-[#ededf0]">Predictions, simplified.</span> Pick a market, take a
              side, and settle when it resolves.
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="rounded-2xl border border-white/[0.06] bg-[#090a0c] p-7 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-[border-color,box-shadow]! duration-300! hover:border-white/[0.14] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_4px_20px_-6px_rgba(0,0,0,0.6)] flex">
                <div className="flex w-full items-stretch gap-4">
                  <span className="flex w-[72px] shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] font-mono text-[15px] font-medium tracking-[0.02em] text-[#18c48c] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">01</span>
                  <div className="min-w-0">
                    <h3 className="mb-1.5 text-[19px] font-semibold tracking-[-0.01em] text-[#ededf0]">Pick a market</h3>
                    <p className="m-0 text-[15px] leading-[1.5] text-[#8a8a93]">From elections and sports to crypto prices and culture — find a question you have a view on.</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-[#090a0c] p-7 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-[border-color,box-shadow]! duration-300! hover:border-white/[0.14] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_4px_20px_-6px_rgba(0,0,0,0.6)] flex">
                <div className="flex w-full items-stretch gap-4">
                  <span className="flex w-[72px] shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] font-mono text-[15px] font-medium tracking-[0.02em] text-[#18c48c] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">02</span>
                  <div className="min-w-0">
                    <h3 className="mb-1.5 text-[19px] font-semibold tracking-[-0.01em] text-[#ededf0]">Take your side</h3>
                    <p className="m-0 text-[15px] leading-[1.5] text-[#8a8a93]">Back Yes or No at live odds, with full control over your stake.</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-[#090a0c] p-7 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-[border-color,box-shadow]! duration-300! hover:border-white/[0.14] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_4px_20px_-6px_rgba(0,0,0,0.6)] flex">
                <div className="flex w-full items-stretch gap-4">
                  <span className="flex w-[72px] shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] font-mono text-[15px] font-medium tracking-[0.02em] text-[#18c48c] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">03</span>
                  <div className="min-w-0">
                    <h3 className="mb-1.5 text-[19px] font-semibold tracking-[-0.01em] text-[#ededf0]">Settle on resolution</h3>
                    <p className="m-0 text-[15px] leading-[1.5] text-[#8a8a93]">Cash out anytime or hold to resolution, 24/7, with instant on-chain settlement.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* See it. Size it. Snipe it. */}
          <div className="py-[60px] md:py-[90px] border-t border-white/5">
            <h2 className="text-[clamp(28px,4vw,46px)] font-medium leading-[1.18] tracking-[-0.02em] text-[#5f5f68] mb-9 max-w-[920px]">
              <span className="text-[#ededf0]">See it. Size it. Snipe it.</span> Tools that surface new
              memecoin launches within 100ms, so you can snipe coins the moment they go live or
              migrate — across every market.
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1.2fr_0.7fr] gap-[18px] items-stretch">
              <div className="bg-[#0b0c0f] border border-white/5 rounded-2xl overflow-hidden min-h-[360px] relative">
                <MiniTrading />
              </div>
              <div className="bg-[#0b0c0f] border border-white/5 rounded-2xl overflow-hidden min-h-[360px] relative">
                <MiniAssetList />
              </div>
              <div className="bg-transparent border-0 rounded-2xl overflow-hidden relative flex items-center justify-center">
                <MiniOrder />
              </div>
            </div>
          </div>

          {/* Trusted by */}
          <div className="py-[60px] md:py-[90px] border-t border-white/5">
            <div className="flex items-end justify-between gap-5 mb-9 flex-wrap">
              <div>
                <h2 className="text-[clamp(28px,4vw,46px)] font-medium leading-[1.18] tracking-[-0.02em] text-[#ededf0] m-0">
                  Trusted by 10,000+ traders
                </h2>
                <p className="text-[#8a8a93] mt-2 text-[15px]">Trade solana coins, predictions, and more at light speed</p>
              </div>
              <Link
                href="https://x.com/interstatefdn"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-white/[0.08] rounded-full px-[18px] py-2.5 text-[14px] text-[#ededf0] no-underline hover:bg-white/[0.04] transition-colors"
              >
                Follow Interstate on <FaXTwitter size={13} />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-4">
              {testimonials.map((t, i) => (
                <TweetCard key={`${t.id}-${i}`} id={t.id} className={testimonialVisibility(i)} />
              ))}
            </div>
          </div>

          {/* Press / as seen in */}
          <div className="border-t border-white/5 py-6 md:py-4">
            <div className="flex flex-col items-center gap-y-3 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-10 sm:gap-y-6 lg:gap-x-14">
              <p className="shrink-0 font-medium uppercase leading-none tracking-[0.2em] text-white/40 text-xs sm:text-xl lg:text-2xl">
                As seen in
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-6 sm:gap-x-10 lg:gap-x-14">
                {press.map((p) => (
                  <a
                    key={p.name}
                    href={p.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-7 items-center justify-center transition-opacity hover:opacity-70 lg:h-9"
                  >
                    <img
                      src={p.src}
                      alt={p.name}
                      loading="lazy"
                      className="h-full w-auto object-contain brightness-0 invert"
                    />
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Self-custody / Security || Needs Rework */}
          {/* <div className="py-[60px] md:py-[90px] border-t border-white/5">
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-20">

              <div className="relative flex items-center justify-center">
                <img
                  src="/privacy-circle.avif"
                  alt="Self-custody privacy"
                  loading="lazy"
                  className="mx-auto block h-auto w-full max-w-[440px] rounded-2xl sm:max-w-[500px]"
                />
              </div>

              <div className="flex flex-col gap-8">
                <div className="flex items-center gap-2 text-sm font-medium text-[#8a8a93]">
                  <span>Secured by</span>
                  <span className="inline-flex items-center gap-1.5 text-[#ededf0]">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    <span className="font-semibold tracking-wide">Turnkey</span>
                  </span>
                </div>

                <div className="space-y-5">
                  <h2 className="text-[clamp(30px,4vw,52px)] font-semibold leading-[1.08] tracking-[-0.02em] text-[#ededf0]">
                    Self-custody wallets<br className="hidden sm:block" /> and infrastructure
                  </h2>
                  <p className="max-w-xl text-[16px] leading-relaxed text-[#8a8a93]">
                    Trade without compromise. Interstate delivers true{" "}
                    <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[13px] font-medium text-[#ededf0]">self-custody</span>{" "}
                    wallets on scalable, battle-tested infrastructure — the speed, security, and precision to
                    trade onchain. Advanced protection keeps your keys safe and your assets in your control.{" "}
                    <strong className="font-semibold text-[#ededf0]">Your keys. Your crypto. Always.</strong>
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    { icon: <Cpu className="h-5 w-5" />, label: "Trusted Hardware" },
                    { icon: <KeyRound className="h-5 w-5" />, label: "Non-Custodial" },
                    { icon: <Server className="h-5 w-5" />, label: "Enterprise-Grade" },
                    { icon: <BadgeCheck className="h-5 w-5" />, label: "Fully Verifiable" },
                  ].map((f) => (
                    <div
                      key={f.label}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0b0c0f] p-4 transition-colors hover:border-white/[0.12]"
                    >
                      <span className="text-[#18c48c]">{f.icon}</span>
                      <span className="text-[15px] font-medium text-[#ededf0]">{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div> */}

          {/* CTA */}
          <section className="relative py-20 md:py-28 lg:py-32 overflow-hidden border-t border-white/5">
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px) 0 0 / 100% 64px, radial-gradient(ellipse at 50% 120%, rgba(24,196,140,0.06), transparent 60%)",
                WebkitMaskImage: "radial-gradient(ellipse at 50% 60%, #000, transparent 75%)",
                maskImage: "radial-gradient(ellipse at 50% 60%, #000, transparent 75%)",
              }}
            />

            {/*  */}

            <div className="relative flex flex-col items-center gap-10 text-center lg:flex-row lg:gap-16 lg:text-left">
              {/* Left — rotating bloom */}
              <div className="flex w-full justify-center lg:w-1/2">
                <img
                  src="/interstate/glass-bloom-sm.webp"
                  alt="Interstate glass bloom"
                  loading="lazy"
                  className="block h-auto w-56 lg:w-[clamp(300px,32vw,440px)] animate-spin-slow drop-shadow-[0_24px_60px_rgba(24,196,140,0.28)]"
                />
              </div>

              {/* Right — copy + actions */}
              <div className="w-full lg:w-1/2">
                <h2 className="text-[clamp(34px,4vw,56px)] leading-[1.1] font-semibold tracking-[-0.025em] text-[#5f5f68] m-0">
                  <span className="text-[#ededf0]">Start trading</span> with real power.
                </h2>
                <p className="text-[#8a8a93] text-[17px] mt-[18px] mb-8">
                  Join traders moving faster, paying less, and staying in full control.
                </p>
                <div className="flex flex-col sm:flex-row gap-3.5 justify-center lg:justify-start flex-wrap">
                  <Link
                    href="/"
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-[#04977c] text-white px-[26px] py-3.5 rounded-xl text-[15px] font-semibold hover:-translate-y-px transition-transform"
                  >
                    Launch the web app <ArrowUpRight className="size-3" />
                  </Link>
                  <Link
                    href="#"
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-[#161719] text-[#ededf0] border border-white/[0.08] px-[26px] py-3.5 rounded-xl text-[15px] font-semibold hover:-translate-y-px transition-transform"
                  >
                    Launch in Claude <span className="text-[#D97757]"><SiClaude size={18} /></span>
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* Footer */}
          <LandingFooter />
        </section>
      </main>
    </>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
