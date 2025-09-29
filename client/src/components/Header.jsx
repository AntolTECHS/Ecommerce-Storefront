// src/components/Header.jsx
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShoppingCart } from "lucide-react";

/**
 * Header — brand + Contact link, always visible
 */
function Header({ cartItemsCount = 0, onCartClick = () => {}, isLoggedIn = false, onLogout }) {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false); // account dropdown
  const wrapRef = useRef(null);

  // Load user from localStorage
  let user = null;
  try {
    const raw = localStorage.getItem("user");
    if (raw) user = JSON.parse(raw);
  } catch {
    user = null;
  }

  // Extract initials
  const initials = (() => {
    const name = (user && (user.name || user.username)) || "";
    if (!name) return "A";
    const parts = name.trim().split(/\s+/);
    return parts.length === 1
      ? parts[0][0].toUpperCase()
      : (parts[0][0] + parts[1][0]).toUpperCase();
  })();

  // Add shadow on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close dropdown on outside click / escape
  useEffect(() => {
    const onDoc = (e) => {
      if (e.type === "keydown" && e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.type === "click" && wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onDoc);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onDoc);
    };
  }, []);

  // Logout
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    if (typeof onLogout === "function") onLogout();
    setOpen(false);
    navigate("/login", { replace: true });
  };

  return (
    <header
      className={`sticky top-0 z-50 bg-white transition-shadow ${
        scrolled ? "shadow-md" : "shadow-sm"
      }`}
      aria-label="Main header"
    >
      <div className="w-full flex items-center justify-between px-4 lg:px-10 h-16">
        {/* LEFT: Brand + Contact */}
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="text-lg md:text-2xl lg:text-3xl font-extrabold text-slate-900 hover:opacity-95"
          >
            TechStore
          </Link>

          <nav className="flex items-center gap-4 text-sm text-slate-700">
            <Link to="/contact" className="hover:text-slate-900 transition">
              Contact
            </Link>
          </nav>
        </div>

        {/* RIGHT: Cart + Account */}
        <div className="flex items-center gap-3" ref={wrapRef}>
          {/* Cart button */}
          <button
            onClick={onCartClick}
            aria-label="Open cart"
            className="relative inline-flex items-center justify-center p-2 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 active:scale-95 transition-transform"
          >
            <ShoppingCart className="h-6 w-6 text-slate-700" />
            {cartItemsCount > 0 && (
              <span
                className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500 text-white border-2 border-white"
                style={{ minWidth: 20, height: 20 }}
              >
                {cartItemsCount}
              </span>
            )}
          </button>

          {/* Account dropdown */}
          <div className="relative">
            {isLoggedIn ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((s) => !s);
                }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                aria-haspopup="true"
                aria-expanded={open}
              >
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-700">
                  {initials}
                </div>
                <span className="hidden sm:inline text-sm text-slate-700">
                  {user?.name ?? "Account"}
                </span>
                <svg
                  className="w-3 h-3 text-slate-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06-.02L10 10.67l3.71-3.48a.75.75 0 111.04 1.08l-4.24 3.98a.75.75 0 01-1.04 0L5.25 8.27a.75.75 0 01-.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full hover:bg-gray-50 text-sm text-slate-700"
              >
                Sign in
              </Link>
            )}

            {open && isLoggedIn && (
              <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg overflow-hidden text-sm">
                <div className="px-4 py-3 border-b">
                  <div className="text-sm font-medium">
                    {user?.name ?? "Account"}
                  </div>
                  <div className="text-xs text-slate-500">{user?.email}</div>
                </div>

                <div className="flex flex-col">
                  <Link to="/profile" className="px-4 py-2 hover:bg-gray-50">
                    Profile
                  </Link>
                  <Link to="/orders" className="px-4 py-2 hover:bg-gray-50">
                    My orders
                  </Link>
                  <Link to="/settings" className="px-4 py-2 hover:bg-gray-50">
                    Settings
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="text-left px-4 py-2 hover:bg-gray-50 text-red-600"
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

// ✅ Export both ways to prevent import errors
export { Header };
export default Header;
