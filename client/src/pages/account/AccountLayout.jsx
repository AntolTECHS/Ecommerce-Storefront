// src/pages/account/AccountLayout.jsx
import { Outlet, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export default function AccountLayout() {
  const [email, setEmail] = useState(() => localStorage.getItem("userEmail") || "");

  // keep email in sync if other parts of the app set it
  useEffect(() => {
    const handler = () => setEmail(localStorage.getItem("userEmail") || "");
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <aside className="bg-white rounded-2xl p-4 shadow">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-indigo-100 text-indigo-700 rounded-full w-12 h-12 flex items-center justify-center font-semibold">
              {email?.[0]?.toUpperCase() || "U"}
            </div>
            <div>
              <div className="font-semibold">{email ? email.split("@")[0] : "User"}</div>
              <div className="text-xs text-muted-foreground">{email}</div>
            </div>
          </div>

          <nav className="flex flex-col gap-2">
            <Link to="/account/profile" className="text-sm px-3 py-2 rounded hover:bg-gray-100">Profile</Link>
            <Link to="/account/orders" className="text-sm px-3 py-2 rounded hover:bg-gray-100">My orders</Link>
            <Link to="/account/settings" className="text-sm px-3 py-2 rounded hover:bg-gray-100">Settings</Link>
          </nav>

          <div className="mt-6">
            <Button variant="outline" size="sm" onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("userEmail");
              window.location.href = "/login";
            }}>
              Logout
            </Button>
          </div>
        </aside>

        {/* Content */}
        <main className="lg:col-span-3">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
