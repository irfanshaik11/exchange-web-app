const DEFAULT_COLOR = "#eab308"; // Nad.fun yellow
const DEFAULT_ICON = "https://avatars.githubusercontent.com/u/173274001?s=200&v=4";

interface ProtocolEntry {
  matchers: string[];
  color: string;
  icon: string;
  fullCircle?: boolean;
}

const PROTOCOL_ENTRIES: ProtocolEntry[] = [
  {
    matchers: ["nad.fun", "nadfun"],
    color: "#eab308",
    icon: DEFAULT_ICON,
  },
  {
    matchers: ["flap.sh", "flapsh"],
    color: "#31e3ac",
    icon: "https://media.licdn.com/dms/image/v2/D4D0BAQFG5I0EDOrmJQ/company-logo_200_200/company-logo_200_200/0/1714693191952/flap_sh_logo?e=2147483647&v=beta&t=2kcdij2YPOFjLdPYzAhQxKgbGcuyh7Cdyp0AkGR8V6A",
  },
  {
    matchers: ["kuru"],
    color: "#31e3ac",
    icon: "https://pbs.twimg.com/profile_images/1950962142917619714/R7Cj_qk7_400x400.jpg",
  },
  {
    matchers: ["pump", "pump.fun"],
    color: "#31e3ac",
    icon: "https://pump.fun/pump-logomark.svg",
  },
  {
    matchers: ["meteora"],
    color: "#d11f3a",
    icon: "https://s1.coincarp.com/logo/1/meteora.png?style=72&v=1759911013",
    fullCircle: true,
  },
  {
    matchers: ["raydium"],
    color: "#31e3ac",
    icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png",
  },
  {
    matchers: ["boop"],
    color: "#134577",
    icon: "https://api.phantom.app/image-proxy/?image=https%3A%2F%2Fdhc7eusqrdwa0.cloudfront.net%2Fassets%2FBOOP_logo_icon_dark_bg.png&anim=true",
  },
  {
    matchers: ["moonit", "moonshot", "moonshoot"],
    color: "#eab308",
    icon: "https://avatars.githubusercontent.com/u/174132191?s=280&v=4",
    fullCircle: true,
  },
  {
    matchers: ["bonk"],
    color: "#ff6b35",
    icon: "https://s3.coinmarketcap.com/static-gravity/image/a28128d9ff7c49c9ad33ee2f626fda40.png",
    fullCircle: true,
  },
  {
    matchers: ["launch"],
    color: "#3b82f6",
    icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/8526.png",
  },
];

export interface ProtocolBranding {
  color: string;
  iconUrl: string;
  isFullCircle: boolean;
}

const FULL_CIRCLE_PROTOCOLS = ["meteora", "bonk", "bags", "moonit", "moonshot", "moonshoot"];

export function getProtocolBranding(protocol?: string): ProtocolBranding {
  if (!protocol) {
    return {
      color: DEFAULT_COLOR,
      iconUrl: DEFAULT_ICON,
      isFullCircle: false,
    };
  }

  const normalized = protocol.toLowerCase();

  for (const entry of PROTOCOL_ENTRIES) {
    if (entry.matchers.some((matcher) => normalized.includes(matcher))) {
      const isFullCircleMatch =
        entry.fullCircle ??
        entry.matchers.some((matcher) =>
          FULL_CIRCLE_PROTOCOLS.some((keyword) => matcher.includes(keyword) || keyword.includes(matcher)),
        );

      return {
        color: entry.color,
        iconUrl: entry.icon,
        isFullCircle: isFullCircleMatch,
      };
    }
  }

  return {
    color: DEFAULT_COLOR,
    iconUrl: DEFAULT_ICON,
    isFullCircle: FULL_CIRCLE_PROTOCOLS.some((keyword) => normalized.includes(keyword)),
  };
}

