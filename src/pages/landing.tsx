import Head from "next/head";
import LandingHeader from '~/components/layout/LandingHeader';
import { ArrowRight, Download } from 'lucide-react';


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
      {/* the color reference was taken from /discover page */}


      <main className="min-h-screen w-full bg-[#030304] text-zinc-100">
        <LandingHeader />
        <section className='relative flex flex-col items-center justify-center flex-1 h-screen w-full overflow-hidden bg-[#030304]'>
          <video
            aria-hidden="true"
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
            src="/videos/homepage_hero_f1.mp4"
          />
          {/* base lighter vignette — always visible */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at center, transparent 0%, transparent 30%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.9) 100%)",
            }}
          />
          {/* stronger vignette — pulses in and out */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at center, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.5) 35%, rgba(0,0,0,0.88) 65%, rgba(0,0,0,1) 100%)",
              animation: "vignette-pulse 4s ease-in-out infinite",
            }}
          />
          <div className="relative z-10 flex flex-col items-center gap-5 lg:gap-8">
            <div className="flex flex-col gap-2 items-center text-center pt-10 px-6 lg:pt-20">
              <h1 className='text-5xl mb-2 md:text-9xl text-white !font-bold uppercase'>Interstate</h1>
              <h1 className="text-[24px] leading-6 lg:text-[40px] text-[#EAEDFF] text-center lg:leading-12 tracking-tighter">
                where traders become legends.
              </h1>
              <p className="lg:text-[22px] text-[#D1D8FF99] text-center lg:leading-6 tracking-tight">
                From memecoins to viral tokens, trade any crypto in seconds.
              </p>
            </div>
            <div className="flex gap-2 lg:hidden w-full justify-center px-8">
              <a
                href=""
                className="text-center z-2 bg-white/12 w-full backdrop-blur-md border border-bg-tertiary rounded-xl text-lg font-bold md:w-50 py-3"
                target="_blank"
                rel="noopener noreferrer"
              >
                Download app
              </a>
            </div>
            <div className="hidden lg:flex gap-3">
              {/* Start Trading Button */}
              <button className="group relative flex items-center justify-center overflow-hidden bg-[#04977c] hover:bg-[#037f68] transition-all duration-300 py-3 w-50 h-13 rounded-xl text-lg font-bold shadow-sm text-white z-10 cursor-pointer">
                <div className="flex items-center justify-center gap-1.5 translate-x-3 group-hover:translate-x-0 transition-transform duration-300 ease-out">
                  <span>Start trading</span>
                  <ArrowRight className="size-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 ease-out shrink-0" />
                </div>
              </button>

              {/* Download App Button */}
              <button className="group relative flex items-center justify-center overflow-hidden bg-white/12 hover:bg-white/20 backdrop-blur-md transition-all duration-300 border border-white/10 rounded-xl text-lg font-bold w-50 h-13 z-10 cursor-pointer">
                <div className="flex items-center justify-center gap-1.5 -translate-x-3 group-hover:translate-x-0 transition-transform duration-300 ease-out">
                  <Download className="size-5 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 ease-out shrink-0" />
                  <span>Download app</span>
                </div>
              </button>
            </div>
          </div>
        </section>
      </main>

    </>
  );
}


//SSR the page to ensure the title and description are correct for SEO and social media sharing, faster render etc. This is important for the landing page because it is the first page users see when they visit the site. It also helps with SEO and social media sharing.
export async function getServerSideProps() {
  return { props: {} };
}