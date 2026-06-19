const CLIENT_LOGOS = [
  { src: "https://cdn.prod.website-files.com/689ad3276bc428c70432ae22/689ad3276bc428c70432b08a_mhv.avif", alt: "MHV" },
  { src: "https://cdn.prod.website-files.com/689ad3276bc428c70432ae22/689ad3276bc428c70432b096_native%20crypto.avif", alt: "Native Crypto" },
  { src: "https://cdn.prod.website-files.com/689ad3276bc428c70432ae22/689ad3276bc428c70432b08b_bloccelerate.avif", alt: "Bloccelerate" },
  { src: "https://cdn.prod.website-files.com/689ad3276bc428c70432ae22/689ad3276bc428c70432b097_marshland%20capital.avif", alt: "Marshland Capital" },
];

// Combine arrays cleanly to ensure we have a full viewport track width
const LOGO_SET = [...CLIENT_LOGOS, ...CLIENT_LOGOS, ...CLIENT_LOGOS, ...CLIENT_LOGOS];

interface SimpleMarqueeProps {
  forceWhite?: boolean;
}

export default function SimpleMarquee({ forceWhite = false }: SimpleMarqueeProps) {
  const imgClass = `h-10 w-auto object-contain opacity-60 hover:opacity-100 transition-all duration-200${forceWhite ? " brightness-0 invert" : ""}`;

  return (
    <div className="w-full overflow-hidden bg-transparent py-6">
      {/* Container holding both identical animation tracks */}
      <div className="flex w-[200%] overflow-hidden select-none">

        {/* Track 1 */}
        <div className="animate-marquee flex min-w-full shrink-0 items-center justify-around gap-16 px-4 [animation-play-state:running] hover:[animation-play-state:paused]">
          {LOGO_SET.map((logo, index) => (
            <img key={`track-1-${index}`} loading="eager" src={logo.src} alt={logo.alt} className={imgClass} />
          ))}
        </div>

        {/* Track 2 (Identical mirror element creating the illusion of infinite flow) */}
        <div className="animate-marquee flex min-w-full shrink-0 items-center justify-around gap-16 px-4 [animation-play-state:running] hover:[animation-play-state:paused]" aria-hidden="true">
          {LOGO_SET.map((logo, index) => (
            <img key={`track-2-${index}`} loading="eager" src={logo.src} alt={logo.alt} className={imgClass} />
          ))}
        </div>
      </div>
    </div>
  );
}