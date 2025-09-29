// src/pages/account/Settings.jsx
import { useState } from "react";
import API from "@/services/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast.js";

export default function Settings() {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState(true);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSavePreferences = () => {
    // demo: save locally for now
    localStorage.setItem("pref_notifications", JSON.stringify(notifications));
    toast?.({ title: "Preferences saved" });
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) {
      toast?.({ title: "Please fill both fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      await API.post("/users/change-password", { oldPassword, newPassword }, { headers: { Authorization: `Bearer ${token}` } });
      toast?.({ title: "Password changed" });
      setOldPassword("");
      setNewPassword("");
    } catch (err) {
      console.error("Change password error", err);
      toast?.({ title: "Failed", description: err?.response?.data?.message || "Could not change password", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow">
      <h3 className="text-lg font-semibold mb-4">Settings</h3>

      <div className="mb-6">
        <h4 className="font-medium mb-2">Preferences</h4>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} />
          <div>
            <div className="font-medium">Email notifications</div>
            <div className="text-sm text-muted-foreground">Receive updates about orders and offers</div>
          </div>
        </label>

        <div className="mt-3">
          <Button onClick={handleSavePreferences}>Save preferences</Button>
        </div>
      </div>

      <div>
        <h4 className="font-medium mb-2">Change password</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input placeholder="Old password" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="p-2 border rounded" />
          <input placeholder="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="p-2 border rounded" />
        </div>
        <div className="mt-3">
          <Button onClick={handleChangePassword} disabled={saving}>{saving ? "Saving..." : "Change password"}</Button>
        </div>
      </div>
    </div>
  );
}
