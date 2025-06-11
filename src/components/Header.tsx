import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { FaSearch, FaStar, FaBell } from "react-icons/fa";
import { useUser } from "./UserContext";
import Cookies from 'js-cookie';
import dynamic from "next/dynamic";
import InterstateButton from './InterstateButton';
import { FiBarChart, FiStar } from "react-icons/fi";

const navLinks = [
  { name: "Discover", href: "/" },
  { name: "Pulse", href: "/pulse" },
  { name: "Trackers", href: "/trackers" },
  { name: "Perpetuals", href: "#" },
  { name: "Yield", href: "#" },
  { name: "Portfolio", href: "/portfolio" },
  { name: "Rewards", href: "#" },
];

interface HeaderProps {
  search?: string;
  setSearch?: (val: string) => void;
  showSearch?: boolean;
}

const DepositModal = dynamic(() => import("./DepositModal"), {
  ssr: false, // NO SSR PLEASE 
});

const WatchlistModal = dynamic(() => import("./WatchlistModal"), {
  ssr: false,
});

const NotificationDropdown = dynamic(() => import("./NotificationDropdown"), {
  ssr: false,
});

export default function Header({ search = "", setSearch, showSearch = true }: HeaderProps) {
  const router = useRouter();
  const isDiscover = router.pathname === "/";
  const { user, loading: userLoading } = useUser();
  const [profileOpen, setProfileOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);

  // Handles opening the deposit modal
  const handleDepositClick = () => {
    const token = Cookies.get('token');
    if (token && !user && !userLoading) {
      // Optionally, refresh user here if needed
    }
    setDepositOpen(true);
  };

  return (
    <>
      <header className="w-full border-b border-emerald-950 bg-neutral-950 backdrop-blur sticky top-0 z-20">
        <div className="max-w-full  border-b border-emerald-950 flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4 min-w-0">
            <span className="text-2xl tracking-tight text-white select-none flex items-center">
              <img src="/logo.png" className="w-12 h-auto" />
              <span className="rounded-full inline-block mr-1" />
              Interstate
            </span>
            <nav className="flex items-center gap-6 ml-8">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`px-1.5 py-0.5 font-medium transition-colors text-sm ${
                    link.name === "Discover" && isDiscover
                      ? "text-emerald-400 border-emerald-400"
                      : "text-neutral-200 hover:text-emerald-400"
                  }`}
                >
                  {link.name}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            {showSearch && (
              <div className="relative flex items-center">
                <span className="absolute left-3 text-neutral-400">
                  <FaSearch size={16} />
                </span>
                <input
                  type="text"
                  placeholder="Search by token or CA..."
                  value={search}
                  onChange={e => setSearch && setSearch(e.target.value)}
                  className="bg-neutral-950 border border-neutral-700 rounded-full pl-9 pr-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition w-64"
                />
              </div>
            )}
            <InterstateButton
              onClick={handleDepositClick}
              variant="primary"
              size="md"
              className="ml-2"
            >
              Deposit
            </InterstateButton>
            <InterstateButton
              onClick={() => setWatchlistOpen(true)}
              variant="secondary"
              size="sm"
              icon={<FaStar className="text-neutral-400" />}
              className="ml-2 h-8"
              title="Watchlist"
            />
            <InterstateButton
              onClick={() => setNotificationOpen(true)}
              variant="secondary"
              size="sm"
              icon={<FaBell className="text-neutral-400" />}
              className="ml-2 h-8"
              title="Notifications"
            />
            {user && !userLoading ? (
              <div className="relative group flex items-center gap-2 cursor-pointer">
                {/* Circular profile picture (placeholder) */}
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-lg select-none">
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </div>
                <span className="text-white text-sm truncate max-w-[100px]">{user.name}</span>
                {/* Dropdown for logout */}
                <div className="absolute right-0 top-10 bg-neutral-900 border border-neutral-800 rounded shadow-lg py-2 px-4 min-w-[120px] opacity-0 group-hover:opacity-100 transition-opacity z-50">
                  <InterstateButton
                    variant="danger"
                    size="sm"
                    className="text-xs font-semibold w-full text-left hover:underline bg-transparent border-none shadow-none px-0 py-0 h-auto"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        document.cookie = 'token=; Max-Age=0; path=/;';
                      }
                      if (typeof window !== 'undefined' && window.localStorage) {
                        window.localStorage.removeItem('token');
                      }
                      if (typeof window !== 'undefined') {
                        window.location.reload();
                      }
                    }}
                  >
                    Logout
                  </InterstateButton>
                </div>
              </div>
            ) : !userLoading && (
              <InterstateButton
                className="ml-2"
                variant="primary"
                size="md"
                onClick={() => {
                  const event = new CustomEvent('open-login-modal');
                  window.dispatchEvent(event);
                }}
              >
                Login
              </InterstateButton>
            )}
          </div>
        </div>
        <div className="flex items-center px-4 gap-1 py-1">
          <button onClick={() => setWatchlistOpen(true)} className="p-1 hover:bg-emerald-950/90 hover:brightness-110 duration-150 ease-in-out rounded cursor-pointer">
            <FiStar />
          </button>
          <button className="p-1 hover:bg-emerald-950/90 hover:brightness-110 duration-150 ease-in-out rounded cursor-pointer">
            <FiBarChart />
          </button>
          <div className="border-r border-emerald-950 h-5"> </div>
        </div>
      </header>
      <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />
      <WatchlistModal open={watchlistOpen} onClose={() => setWatchlistOpen(false)} />
      <NotificationDropdown open={notificationOpen} onClose={() => setNotificationOpen(false)} />
    </>
  );
} 