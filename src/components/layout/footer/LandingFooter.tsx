/* ----------------------------- data ----------------------------- */

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
    <span className="inline-flex items-center gap-2">
      <img
        src="/interstate/logo.png"
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

/* ----------------------------- footer ----------------------------- */

export default function LandingFooter() {
  return (
    <footer className="border-t border-white/5 pt-14 pb-9">
      <div className="mb-10">
        <Logo size={20} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_0.7fr_0.7fr] gap-8">
        {footerCols.map((col) => (
          <div key={col.title}>
            <h4 className="text-[15px] font-semibold mb-[18px] text-[#ededf0]">{col.title}</h4>
            {col.groups.map((g) => (
              <div key={g.h} className="flex flex-col gap-[9px] mb-5">
                <span className="text-[11px] tracking-[0.08em] text-[#5f5f68] mb-0.5">{g.h}</span>
                {g.items.map((it) => (
                  <a key={it} href="#" className="text-[14px] text-[#8a8a93] hover:text-[#ededf0] transition-colors">
                    {it}
                  </a>
                ))}
              </div>
            ))}
          </div>
        ))}

        <div className="lg:text-right">
          <h4 className="text-[15px] font-semibold mb-[18px] text-[#ededf0]">Company</h4>
          <div className="flex flex-col gap-[9px] mb-5">
            {companyLinks.map((l) => (
              <a key={l} href="#" className="text-[14px] text-[#8a8a93] hover:text-[#ededf0] transition-colors">
                {l}
              </a>
            ))}
          </div>
        </div>

        <div className="lg:text-right">
          <h4 className="text-[15px] font-semibold mb-[18px] text-[#ededf0]">Social</h4>
          <div className="flex flex-col gap-[9px] mb-5">
            {socialLinks.map((l) => (
              <a key={l} href="#" className="text-[14px] text-[#8a8a93] hover:text-[#ededf0] transition-colors">
                {l}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-white/5 text-[13px] text-[#5f5f68]">
        <span>© {new Date().getFullYear()} Interstate. All rights reserved.</span>
      </div>
    </footer>
  );
}
