import { useState } from "react";
import {
  SiBitcoin,
  SiSolana,
  SiEthereum,
  SiGoogle,
  SiApple,
  SiNvidia,
  SiTesla,
  SiSpacex,
  SiBinance,
  SiRipple,
  SiOpenai,
  SiDogecoin,
} from "react-icons/si";

/* ─── types ─────────────────────────────────────────────────────────────── */

type Market = {
  name: string;
  sym: string;
  icon: React.ReactNode;
  bg: string;
  fg?: string;
  category: "crypto" | "rwa";
};

/* ─── helpers ────────────────────────────────────────────────────────────── */

const dot = (label: string, color: string) => (
  <span style={{ color, fontWeight: 700, fontSize: 13 }}>{label}</span>
);

/* ─── data ───────────────────────────────────────────────────────────────── */

const marketsRow1: Market[] = [
  { name: "Nvidia",   sym: "NVDA",   icon: <SiNvidia />,   bg: "#0d2818", fg: "#76b900", category: "rwa" },
  { name: "Solana",   sym: "SOL",    icon: <SiSolana />,   bg: "#0a0a0a", fg: "#14f195", category: "crypto" },
  { name: "Crude Oil",sym: "CL",     icon: dot("CL","#c98b3c"), bg: "#2a1c0e",            category: "rwa" },
  { name: "OpenAI",   sym: "OPENAI", icon: <SiOpenai />,   bg: "#ffffff", fg: "#0a0a0a", category: "rwa" },
  { name: "Bitcoin",  sym: "BTC",    icon: <SiBitcoin />,  bg: "#f7931a", fg: "#ffffff", category: "crypto" },
  { name: "Google",   sym: "GOOG",   icon: <SiGoogle />,   bg: "#ffffff", fg: "#4285f4", category: "rwa" },
  { name: "Gold",     sym: "XAU",    icon: dot("Au","#e8c14a"), bg: "#3a300f",            category: "rwa" },
  { name: "Tesla",    sym: "TSLA",   icon: <SiTesla />,    bg: "#e31937", fg: "#ffffff", category: "rwa" },
  { name: "Ethereum", sym: "ETH",    icon: <SiEthereum />, bg: "#1a1a2e", fg: "#a8b0e0", category: "crypto" },
];

const marketsRow2: Market[] = [
  { name: "Dogecoin",   sym: "DOGE",   icon: <SiDogecoin />, bg: "#1c1708", fg: "#c2a633", category: "crypto" },
  { name: "SpaceX",     sym: "SPACEX", icon: <SiSpacex />,   bg: "#0a0a0a", fg: "#ffffff", category: "rwa" },
  { name: "Silver",     sym: "XAG",    icon: dot("Ag","#c0c0c8"),  bg: "#26282b",           category: "rwa" },
  { name: "Sui",        sym: "SUI",    icon: dot("S","#4da2ff"),   bg: "#0c2a52", fg: "#4da2ff", category: "crypto" },
  { name: "Coreweave",  sym: "CRWV",   icon: dot("CW","#ffffff"),  bg: "#101114",           category: "rwa" },
  { name: "Nasdaq 100", sym: "NDX",    icon: dot("100","#4da2ff"), bg: "#0c2540",           category: "rwa" },
  { name: "Apple",      sym: "AAPL",   icon: <SiApple />,    bg: "#0a0a0a", fg: "#ffffff", category: "rwa" },
  { name: "BNB",        sym: "BNB",    icon: <SiBinance />,  bg: "#1c1708", fg: "#f0b90b", category: "crypto" },
  { name: "Anthropic",  sym: "ANTHR",  icon: dot("A","#0a0a0a"),   bg: "#ffffff",           category: "rwa" },
];

const marketsRow3: Market[] = [
  { name: "Samsung",   sym: "SMSN", icon: dot("S","#ffffff"),    bg: "#1428a0",            category: "rwa" },
  { name: "Dow Jones", sym: "DJI",  icon: dot("DJ","#9aa5b1"),   bg: "#1d2733",            category: "rwa" },
  { name: "Ripple",    sym: "XRP",  icon: <SiRipple />,          bg: "#0a0a0a", fg: "#ffffff", category: "crypto" },
  { name: "Oracle",    sym: "ORCL", icon: dot("O","#ffffff"),    bg: "#c74634",            category: "rwa" },
  { name: "ExxonMobil",sym: "XOM",  icon: dot("EX","#e31937"),   bg: "#fff",               category: "rwa" },
  { name: "Alibaba",   sym: "BABA", icon: dot("a","#ff6a00"),    bg: "#2a1505",            category: "rwa" },
  { name: "SK Hynix",  sym: "SKHX", icon: dot("SK","#ff5a36"),   bg: "#1a1410",            category: "rwa" },
  { name: "Platinum",  sym: "XPT",  icon: dot("Pt","#cdd2d8"),   bg: "#26282b",            category: "rwa" },
  { name: "Chainlink", sym: "LINK", icon: dot("◈","#ffffff"),    bg: "#2a5ada",            category: "crypto" },
];

/* ─── sub-components ─────────────────────────────────────────────────────── */

function MarketPill({ m, dimmed }: { m: Market; dimmed: boolean }) {
  return (
    <div
      className="inline-flex items-center gap-2.5 bg-[#0e0f11] border border-white/[0.07] rounded-full py-2 pl-2 pr-4 flex-shrink-0 transition-opacity duration-300"
      style={{ opacity: dimmed ? 0.2 : 1 }}
    >
      <span
        className="w-[30px] h-[30px] rounded-full inline-flex items-center justify-center text-[15px] flex-shrink-0 [&_svg]:w-4 [&_svg]:h-4"
        style={{ background: m.bg, color: m.fg ?? "#ffffff" }}
      >
        {m.icon}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-white">{m.name}</span>
        <span className="text-[11px] text-zinc-500">{m.sym}</span>
      </span>
    </div>
  );
}

function MarqueeRow({ items, reverse = false, tab }: { items: Market[]; reverse?: boolean; tab: Tab }) {
  const doubled = [...items, ...items];
  return (
    <div
      className="overflow-hidden"
      style={{
        WebkitMaskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
        maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
      }}
    >
      <div
        className="flex gap-3 w-max"
        style={{ animation: `lqscroll 48s linear infinite${reverse ? " reverse" : ""}` }}
      >
        {doubled.map((m, i) => (
          <MarketPill key={`${m.sym}-${i}`} m={m} dimmed={tab !== "all" && m.category !== tab} />
        ))}
      </div>
    </div>
  );
}

/* ─── main component ─────────────────────────────────────────────────────── */

type Tab = "all" | "crypto" | "rwa";

export default function MarketsMarquee() {
  const [tab, setTab] = useState<Tab>("all");

  return (
    <section className="w-full py-10 md:py-14 lg:py-20 xl:py-24">
      <style>{`@keyframes lqscroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>

      {/* Header row */}
      <div className="flex items-start justify-between gap-6 flex-wrap mb-8">
        <h2 className="text-[clamp(26px,3.6vw,42px)] font-medium leading-[1.18] tracking-tight text-zinc-400 max-w-[820px]">
          Trade{" "}
          <span className="text-white">500+ markets</span>, from{" "}
          <span
            className="inline-flex items-center justify-center rounded-full font-bold align-middle"
            style={{ background: "#f7931a", color: "#fff", width: "1.05em", height: "1.05em", fontSize: "0.7em", verticalAlign: "-0.16em" }}
          >
            <SiBitcoin />
          </span>{" "}
          <span className="text-white">Bitcoin</span> and{" "}
          <span
            className="inline-flex items-center justify-center rounded-full font-bold align-middle p-4 mt-0.5"
            style={{ background: "#3a300f", color: "#e8c14a", width: "1.05em", height: "1.05em", fontSize: "0.4em" }}
          >
            Au
          </span>{" "}
          <span className="text-white">GOLD</span> to FX and stocks, in seconds.
        </h2>

        {/* Filter tabs */}
        <div className="flex md:inline-flex w-full md:w-auto bg-white/[0.04] border border-white/[0.07] rounded-full p-1 flex-shrink-0">
          {(["all", "crypto", "rwa"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 md:flex-none text-sm px-[18px] py-[7px] rounded-full cursor-pointer transition-colors duration-150 ${
                tab === t ? "bg-[#1a1b1f] text-white" : "bg-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t === "all" ? "All" : t === "crypto" ? "Crypto" : "Real World"}
            </button>
          ))}
        </div>
      </div>

      {/* Marquee rows */}
      <div className="flex flex-col gap-3 mt-10 md:mt-12 lg:mt-16">
        <MarqueeRow items={marketsRow1} tab={tab} />
        <MarqueeRow items={marketsRow2} reverse tab={tab} />
        <MarqueeRow items={marketsRow3} tab={tab} />
      </div>
    </section>
  );
}
