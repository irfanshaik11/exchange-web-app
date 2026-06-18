import Link from 'next/link'

const LandingHeader = () => {
    return (
        <header className="items-center h-13 py-8 md:py-10 justify-between flex absolute top-0 left-0 right-0 w-full px-2.5 md:px-8 z-50">
            <Link aria-label="Interstate home" className="group flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center gap-1.5 tracking-tight select-none transition-all duration-200 sm:min-h-0 sm:min-w-0 sm:justify-start" title="Go to Trenches" href="/">
                <img
                    src="/interstate/logo.png"
                    alt="Interstate logo"
                    className="h-9 w-9 md:h-10 md:w-10 lg:h-12 lg:w-12 flex-shrink-0 object-contain transition-all duration-200 group-hover:drop-shadow-[0_0_8px_rgba(24,196,140,0.4)] sm:h-5 sm:w-auto"
                />
                <h3 className="text-3xl md:text-4xl md:font-bold tracking-tight text-[#CBD0EB]">Interstate</h3>
            </Link>
            <a href="https://app.interstate.so" target="_blank" rel="noopener noreferrer" className="bg-[#04977c] text-white tracking-[0] text-md rounded-xl py-2 lg:py-2.5 px-5 font-normal leading-6 overflow-hidden shadow-[0_1px_2px_#8750ff0d] cursor-pointer hover:brightness-110 transition-all">
                Trade Now
            </a>
        </header>
    )
}

export default LandingHeader