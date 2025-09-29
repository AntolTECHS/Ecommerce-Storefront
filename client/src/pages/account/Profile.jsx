// src/pages/account/Profile.jsx
import { useEffect, useState } from "react";
import API from "@/services/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast.js";
import { useNavigate } from "react-router-dom";

/**
 * Profile page
 * - Fetches /users/me (requires token)
 * - Displays a header with avatar initials, name, email, role and "member since"
 * - Shows editable form fields (name, email, phone)
 * - Persists updates to PUT /users/me and updates localStorage user
 */

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // profile holds editable fields
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    phone: "",
  });

  // meta holds read-only values from server (role, createdAt, etc)
  const [meta, setMeta] = useState({
    role: "",
    createdAt: null,
    _id: null,
  });

  const { toast } = useToast();
  const navigate = useNavigate();

  // derive initials for avatar circle
  const initials = (() => {
    const name = profile.name || "";
    if (!name) return "A";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  })();

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (!token) {
        // not logged in
        navigate("/login");
        return;
      }

      try {
        const res = await API.get("/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = res.data || {};
        setProfile({
          name: data.name || "",
          email: data.email || "",
          phone: data.phone || "",
        });
        setMeta({
          role: data.role || "",
          createdAt: data.createdAt || null,
          _id: data._id || null,
        });

        // persist a lightweight "user" in localStorage for other UI (avatar, header, etc)
        try {
          localStorage.setItem("user", JSON.stringify({
            _id: data._id,
            name: data.name,
            email: data.email,
            role: data.role,
          }));
        } catch (e) {
          // ignore localStorage failures
        }
      } catch (err) {
        console.error("Profile fetch error:", err);

        // Try to fallback to cached local user
        try {
          const raw = localStorage.getItem("user");
          if (raw) {
            const cached = JSON.parse(raw);
            setProfile({
              name: cached.name || "",
              email: cached.email || "",
              phone: "", // phone not usually cached
            });
            setMeta({
              role: cached.role || "",
              createdAt: null,
              _id: cached._id || null,
            });
            toast?.({ title: "Offline mode", description: "Showing cached profile. Try refreshing when online.", variant: "warning" });
          } else {
            toast?.({ title: "Failed to load profile", description: "Please sign in again.", variant: "destructive" });
            navigate("/login");
          }
        } catch (e) {
          toast?.({ title: "Failed to load profile", description: "Please try again.", variant: "destructive" });
          navigate("/login");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate, toast]);

  const handleSave = async () => {
    setSaving(true);
    const token = localStorage.getItem("token");
    if (!token) {
      toast?.({ title: "Not authenticated", description: "Please log in and try again", variant: "destructive" });
      navigate("/login");
      return;
    }

    try {
      const res = await API.put("/users/me", profile, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const updated = res.data || {};
      setProfile({
        name: updated.name || profile.name,
        email: updated.email || profile.email,
        phone: updated.phone || profile.phone,
      });
      setMeta((m) => ({ ...m, role: updated.role || m.role, _id: updated._id || m._id }));

      // update cached user
      try {
        localStorage.setItem("user", JSON.stringify({
          _id: updated._id || meta._id,
          name: updated.name || profile.name,
          email: updated.email || profile.email,
          role: updated.role || meta.role,
        }));
      } catch (e) {
        // ignore localStorage errors
      }

      toast?.({ title: "Profile updated", description: "Your profile was saved." });
    } catch (err) {
      console.error("Profile save error:", err);
      toast?.({ title: "Save failed", description: err?.response?.data?.message || "Could not update profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-gray-600 animate-pulse">Loading profile…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-white rounded-2xl shadow p-6 flex items-center gap-6">
        <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-2xl font-bold text-slate-700">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold truncate">{profile.name || "Anonymous"}</h1>
              <div className="text-sm text-slate-500 truncate">{profile.email}</div>
            </div>

            <div className="text-right">
              <div className="text-sm text-slate-500">Role</div>
              <div className="font-medium">{meta.role || "customer"}</div>
            </div>
          </div>

          <div className="mt-3 text-sm text-slate-500">
            <div>Member since: {meta.createdAt ? new Date(meta.createdAt).toLocaleDateString() : "—"}</div>
            <div className="mt-1 text-xs text-slate-400">ID: {meta._id || "—"}</div>
          </div>
        </div>
      </div>

      {/* Editable form */}
      <div className="bg-white rounded-2xl shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Profile</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Full name</label>
            <input
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="w-full mt-1 p-3 border rounded-md"
              placeholder="Your full name"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              className="w-full mt-1 p-3 border rounded-md"
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Phone</label>
            <input
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              className="w-full mt-1 p-3 border rounded-md"
              placeholder="+254 7xx xxx xxx"
            />
          </div>

          {/* show role and ID read-only on the right column for wide screens */}
          <div>
            <label className="text-sm font-medium">Role</label>
            <div className="w-full mt-1 p-3 border rounded-md bg-gray-50 text-sm text-slate-700">{meta.role || "customer"}</div>

            <label className="text-sm font-medium mt-3 block">Member since</label>
            <div className="w-full mt-1 p-3 border rounded-md bg-gray-50 text-sm text-slate-700">
              {meta.createdAt ? new Date(meta.createdAt).toLocaleDateString() : "—"}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>

          <Button variant="outline" onClick={() => {
            // reload profile from server (or cached)
            window.location.reload();
          }}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
