import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { FaSearch } from "react-icons/fa";
import { useUser } from "./UserContext";
import DepositModal from "./DepositModal";
import Cookies from 'js-cookie';

const navLinks = [
  { name: "Discover", href: "/" },
  { name: "Pulse", href: "#" },
  { name: "Trackers", href: "#" },
  { name: "Perpetuals", href: "#" },
  { name: "Yield", href: "#" },
  { name: "Portfolio", href: "#" },
  { name: "Rewards", href: "#" },
];

interface HeaderProps {
  search?: string;
  setSearch?: (val: string) => void;
  showSearch?: boolean;
}

export default function Header({ search = "", setSearch, showSearch = true }: HeaderProps) {
  const router = useRouter();
  const isDiscover = router.pathname === "/";
  const { user, loading: userLoading } = useUser();
  const [profileOpen, setProfileOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);

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
      <header className="w-full border-b border-neutral-800 bg-neutral-900/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-full flex items-center justify-between px-8 py-3">
          <div className="flex items-center gap-10 min-w-0">
            <span className="text-2xl font-extrabold tracking-tight text-white select-none flex items-center">
              <img src="/logo.png" className="w-12 h-auto" />
              <span className="rounded-full inline-block mr-1" />
              Interstate
            </span>
            <nav className="flex items-center gap-6 ml-8">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`px-1.5 py-0.5 font-medium transition-colors text-base ${
                    link.name === "Discover" && isDiscover
                      ? "text-emerald-400 border-b-2 border-emerald-400"
                      : "text-neutral-200 hover:text-emerald-400"
                  }`}
                >
                  {link.name}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4 min-w-0">
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
                  className="bg-neutral-800 border border-neutral-700 rounded-full pl-9 pr-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition w-64"
                />
              </div>
            )}
            <button
              onClick={handleDepositClick}
              className="ml-2 px-5 py-1.5 rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white text-base transition shadow focus:outline-none cursor-pointer"
            >
              Deposit
            </button>
            {user && !userLoading ? (
              <div className="relative group flex items-center gap-2 cursor-pointer">
                {/* Circular profile picture (placeholder) */}
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-lg select-none">
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </div>
                <span className="font-semibold text-white text-sm truncate max-w-[100px]">{user.name}</span>
                {/* Dropdown for logout */}
                <div className="absolute right-0 top-10 bg-neutral-900 border border-neutral-800 rounded shadow-lg py-2 px-4 min-w-[120px] opacity-0 group-hover:opacity-100 transition-opacity z-50">
                  <button
                    className="text-red-400 text-xs font-semibold w-full text-left hover:underline"
                    onClick={() => {
                      // Remove token and reset user
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
                  </button>
                </div>
              </div>
            ) : !userLoading && (
              <button
                className="ml-2 px-5 py-1.5 rounded-full font-semibold bg-emerald-600 hover:bg-emerald-700 text-white text-base transition shadow focus:outline-none"
                onClick={() => {
                  // Use a custom event or context to open login modal in parent
                  const event = new CustomEvent('open-login-modal');
                  window.dispatchEvent(event);
                }}
              >
                Login
              </button>
            )}
          </div>
        </div>
      </header>
      <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />
    </>
  );
} 