import Link from "next/link";
import { FaXTwitter, FaTelegram } from "react-icons/fa6";

/* ----------------------------- data ----------------------------- */

// DOM order is the phone order (single-column stack); `order` controls the
// multi-column layout from sm up (left→right: Resources, Socials, Company).
const navColumns = [
  {
    title: "Company",
    order: "sm:order-3",
    links: [
      { label: "Documentation", href: "https://docs.interstate.so" },
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
    ],
  },
  {
    title: "Resources",
    order: "sm:order-1",
    links: [{ label: "Brand Kit", href: "#" }],
  },
  {
    title: "Socials",
    order: "sm:order-2",
    links: [
      { label: "Twitter", href: "https://x.com/interstatefdn" },
      { label: "Telegram", href: "https://t.me/+DDXGrsJoe3szYTAx" },
    ],
  },
];

const socials = [
  { label: "X", href: "https://x.com/interstatefdn", icon: FaXTwitter },
  { label: "Telegram", href: "https://t.me/+DDXGrsJoe3szYTAx", icon: FaTelegram },
];

/* ----------------------------- components ----------------------------- */

function NavGroup({ group }: { group: (typeof navColumns)[number] }) {
  return (
    <div className={group.order}>
      <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
        {group.title}
      </h4>
      <ul className="flex flex-col gap-3.5">
        {group.links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target={l.href.startsWith("http") ? "_blank" : undefined}
              rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="text-sm text-white/60 transition-colors duration-200 hover:text-white"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------- footer ----------------------------- */

export default function LandingFooter() {
  return (
    <footer className="relative isolate pt-20 pb-12 lg:pt-28 lg:pb-14">
      {/* Gradient hairline separator */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />

      {/* Decorative layer — clipped on its own so the giant wordmark/glow can't
          overflow the page, while the footer itself stays unclipped (so the
          -ml-2 logo isn't cut off). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {/* Atmospheric emerald glow */}
        <div className="absolute -top-28 left-1/2 h-72 w-[70%] -translate-x-1/2 rounded-full bg-[rgba(24,196,140,0.06)] blur-[130px]" />

        {/* Giant brand wordmark anchor — bleeds off the bottom edge */}
        <span className="absolute inset-x-0 -bottom-[0.14em] origin-bottom scale-y-[3] select-none whitespace-nowrap text-center text-[clamp(4rem,17vw,15rem)] font-extrabold uppercase leading-none tracking-tighter bg-gradient-to-b from-white/[0.07] to-transparent bg-clip-text text-transparent sm:scale-y-100">
          Interstate
        </span>
      </div>

      {/* Content */}
      <div className="relative z-10 grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-8">
        {/* Brand block */}
        <div className="flex max-w-md flex-col lg:col-span-6">
          <Link
            aria-label="Interstate home"
            href="/"
            className="group mb-6 -ml-2 flex w-fit flex-shrink-0 items-center gap-1.5 tracking-tight select-none transition-all duration-200"
          >
            <img
              src="/interstate/logo.png"
              alt="Interstate logo"
              className="h-11 w-11 md:h-12 md:w-12 lg:h-14 lg:w-14 flex-shrink-0 object-contain transition-all duration-200 group-hover:drop-shadow-[0_0_8px_rgba(24,196,140,0.4)]"
            />
            <h3 className="text-4xl md:text-5xl font-bold tracking-tight text-[#CBD0EB]">Interstate</h3>
          </Link>

          <h2 className="bg-gradient-to-br from-white via-white to-white/55 bg-clip-text text-[1.75rem] font-semibold leading-[1.2] tracking-tight text-transparent sm:text-[2rem] sm:leading-[1.15]">
            We&apos;re building towards a faster, interoperable &amp; decentralized future.
          </h2>

          {/* <div className="mt-9 flex items-center gap-3">
            {socials.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-[#CBD0EB] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
              >
                <Icon className="h-[17px] w-[17px]" />
              </a>
            ))}
          </div> */}
        </div>

        {/* Nav cluster — confidently grouped on the right */}
        <nav className="grid grid-cols-2 gap-x-12 gap-y-10 sm:grid-cols-3 sm:gap-x-10 sm:text-right lg:col-span-6 lg:gap-x-16">
          {/* Phone: Company in the left column */}
          <NavGroup group={navColumns[0]} />
          {/* Phone: Resources + Socials stacked in the right column.
              sm+: `contents` flattens them into the 3-col grid. */}
          <div className="flex flex-col gap-6 text-right sm:contents">
            <NavGroup group={navColumns[1]} />
            <NavGroup group={navColumns[2]} />
          </div>
        </nav>
      </div>

      {/* Bottom bar */}
      <div className="relative z-10 mt-20 flex flex-col-reverse items-center gap-5 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left lg:mt-28">
        <span className="text-[13px] text-white/40">
          © {new Date().getFullYear()} Interstate. All rights reserved.
        </span>
        <a
          href="#"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[13px] text-white/55 transition-colors duration-200 hover:border-white/20 hover:text-white/80"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#18c48c] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#18c48c]" />
          </span>
          All systems operational
        </a>
      </div>
    </footer>
  );
}
