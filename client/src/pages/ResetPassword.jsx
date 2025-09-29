// src/pages/ResetPassword.jsx
import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";
import API from "@/services/api";
import { useToast } from "@/hooks/use-toast";

/**
 * Client-side password validator that mirrors server rules in
 * server/controllers/authController.js (keeps UX consistent).
 */
const validatePassword = (password) => {
  const minLength = 8;
  if (!password || password.length < minLength) {
    return `Password must be at least ${minLength} characters long.`;
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number.";
  }
  if (!/[!@#$%^&*(),.?\":{}|<>]/.test(password)) {
    return "Password must include at least one special character.";
  }
  return null;
};

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState("");

  // Abort controller ref so we can cancel requests on unmount
  const abortRef = useRef(null);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        try {
          abortRef.current.abort();
        } catch (e) {
          // ignore
        }
      }
    };
  }, []);

  // NOTE: If your API service (src/services/api) already includes "/api" in baseURL,
  // keep the path below as "/auth/reset-password/:token".
  // If your API base DOES NOT include "/api", use "/api/auth/reset-password/:token".
  const apiPath = `/auth/reset-password/${token}`;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setInlineError("");

    if (!token) {
      setInlineError("Missing or invalid reset link.");
      toast({ title: "Invalid link", description: "Missing reset token", variant: "destructive" });
      return;
    }

    // client-side validation that matches server rules
    const pwError = validatePassword(password);
    if (pwError) {
      setInlineError(pwError);
      toast({ title: pwError, variant: "destructive" });
      return;
    }

    if (password !== confirm) {
      setInlineError("Passwords do not match.");
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    setLoading(true);

    // abort previous request if any
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch (e) {}
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await API.post(apiPath, { password }, { signal: controller.signal });

      toast({
        title: "Password reset",
        description: "You can now log in with your new password.",
      });

      // navigate to login after success
      navigate("/login");
    } catch (err) {
      // handle abort separately
      if (err?.name === "CanceledError" || err?.name === "AbortError") {
        console.debug("Reset password request aborted");
        return;
      }

      console.error("Reset password error:", err?.response?.data || err?.message || err);

      const serverMsg = err?.response?.data?.message;
      setInlineError(serverMsg || "Token may be invalid or expired.");
      toast({
        title: "Reset failed",
        description: serverMsg || "Token may be invalid or expired.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <Card className="w-full max-w-md bg-gray-100 shadow-xl animate-fade">
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <CardHeader>
            <CardTitle className="text-center text-2xl font-bold">Reset Password</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">Set a new password for your account.</p>

            {/* New Password with toggle */}
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label="New password"
                required
                minLength={8}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Confirm Password with toggle */}
            <div className="relative">
              <Input
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-label="Confirm new password"
                required
                minLength={8}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600"
                onClick={() => setShowConfirm((s) => !s)}
                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {inlineError && (
              <div role="alert" className="text-sm text-red-600">
                {inlineError}
              </div>
            )}

            <div className="text-xs text-gray-500">
              Password must be at least 8 characters and include upper &amp; lower case letters, a number, and a special character.
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              {loading ? "Saving..." : "Set New Password"}
            </Button>

            <p className="text-sm text-center text-zinc-600">
              <Link to="/login" className="text-blue-600 hover:underline">
                Back to login
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
