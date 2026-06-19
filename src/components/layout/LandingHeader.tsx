import Link from 'next/link'

const LandingHeader = () => {
    return (
        <header className="items-center h-13 py-8 md:py-10 justify-between flex absolute top-0 left-0 right-0 w-full px-2.5 md:px-8 z-50">
            {/* Progressive blur layer — fades out at the bottom so there's no hard edge.
                Kept on its own layer so the logo/buttons stay perfectly crisp. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 -bottom-16 -z-10 backdrop-blur-md backdrop-saturate-150 bg-gradient-to-b from-black/70 via-black/25 to-transparent [-webkit-mask-image:linear-gradient(to_bottom,black_45%,transparent)] [mask-image:linear-gradient(to_bottom,black_45%,transparent)]"
            />
            <Link aria-label="Interstate home" className="group flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center gap-1.5 tracking-tight select-none transition-all duration-200 sm:min-h-0 sm:min-w-0 sm:justify-start" title="Go to Trenches" href="/">
                <img
                    src="/interstate/logo.png"
                    alt="Interstate logo"
                    className="h-9 w-9 md:h-10 md:w-10 lg:h-12 lg:w-12 flex-shrink-0 object-contain transition-all duration-200 group-hover:drop-shadow-[0_0_8px_rgba(24,196,140,0.4)] sm:h-5 sm:w-auto"
                />
                <h3 className="text-3xl md:text-4xl md:font-bold tracking-tight text-[#CBD0EB]">Interstate</h3>
            </Link>
            <div className="flex items-center gap-2 lg:gap-3">
                <Link href="/docs" className="hidden sm:inline-block bg-white/[0.08] text-[#ededf0] border border-white/10 backdrop-blur-md tracking-[0] text-md rounded-xl py-2 lg:py-2.5 px-5 font-normal leading-6 cursor-pointer hover:bg-white/[0.14] transition-all">
                    Docs
                </Link>
                <a href="https://app.interstate.so" target="_blank" rel="noopener noreferrer" className="whitespace-nowrap bg-[#04977c] text-white tracking-[0] text-md rounded-xl py-2 lg:py-2.5 px-5 font-normal leading-6 overflow-hidden shadow-[0_1px_2px_#8750ff0d] cursor-pointer hover:brightness-110 transition-all">
                    Trade Now
                </a>
            </div>
        </header>
    )
}

export default LandingHeader