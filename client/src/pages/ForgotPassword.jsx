// src/pages/ForgotPassword.jsx
import { useEffect, useState, useRef } from "react";
import { useLocation, Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import API from "@/services/api";
import { useToast } from "@/hooks/use-toast";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
  const location = useLocation();
  const { toast } = useToast();

  // Prefill email if passed in state or query params
  const q = new URLSearchParams(location.search);
  const initialEmail =
    (location.state && location.state.email) || q.get("email") || "";

  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0); // seconds remaining to allow resend
  const [inlineError, setInlineError] = useState("");
  const inputRef = useRef(null);

  // keep a ref to the active request so we can cancel on unmount
  const abortRef = useRef(null);

  useEffect(() => {
    // Focus input only when there's no prefilled email
    if (!initialEmail && inputRef.current) {
      inputRef.current.focus();
    }
  }, [initialEmail]);

  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  // cleanup pending request on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch (e) {}
      }
    };
  }, []);

  const validateEmail = (value) => {
    if (!value) return "Please enter your email.";
    if (!EMAIL_REGEX.test(value)) return "Please enter a valid email address.";
    return null;
  };

  /**
   * NOTE ABOUT THE ENDPOINT:
   * - If your API service (src/services/api) already uses a baseURL that includes "/api",
   *   keep the path as "/auth/forgot-password" (this file uses that).
   * - If your API base does NOT include "/api", but your server expects "/api/auth/forgot-password",
   *   change the path below to "/api/auth/forgot-password".
   */

  const sendReset = async (targetEmail) => {
    setInlineError("");
    setLoading(true);

    // cancel any previous request
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch (e) {}
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // keep path intentionally short — adjust if your API base differs (see note above)
      await API.post(
        "/auth/forgot-password",
        { email: targetEmail.toLowerCase().trim() },
        { signal: controller.signal }
      );

      // UX: Show generic success (server should also be generic)
      setSent(true);
      setCooldown(60); // block resends for 60s
      toast({
        title: "If the account exists",
        description:
          "We've sent password reset instructions if the email is registered.",
      });
    } catch (err) {
      // Distinguish between aborts and real errors
      if (err?.name === "CanceledError" || err?.name === "AbortError") {
        console.debug("Forgot password request aborted");
        return;
      }

      // Log useful info for production debugging (but don't expose secrets to the user)
      console.error(
        "Forgot password error (client):",
        err?.response?.status,
        err?.response?.data || err?.message || err
      );

      // prefer server-supplied message when available; otherwise generic message
      const serverMsg = err?.response?.data?.message;
      setInlineError(serverMsg || "Failed to send reset email. Please try again later.");
      toast({
        title: "Failed to send reset email",
        description: serverMsg || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setInlineError("");
    const err = validateEmail(email);
    if (err) {
      setInlineError(err);
      toast({ title: err, variant: "destructive" });
      return;
    }

    await sendReset(email);
    // do not clear email on success so users can resend or correct it
  };

  const handleResend = async () => {
    setInlineError("");
    const err = validateEmail(email);
    if (err) {
      setInlineError(err);
      toast({ title: err, variant: "destructive" });
      return;
    }
    if (cooldown > 0) {
      toast({ title: `Please wait ${cooldown}s before resending.`, variant: "destructive" });
      return;
    }
    await sendReset(email);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <Card className="w-full max-w-md bg-gray-100 shadow-xl animate-fade">
        <form onSubmit={handleSubmit} className="space-y-6">
          <CardHeader>
            <CardTitle className="text-center text-2xl font-bold">
              Forgot your password?
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {!sent ? (
              <>
                <p className="text-sm text-gray-600">
                  Enter your email and we'll send you a reset link (if an account exists).
                </p>

                <Input
                  ref={inputRef}
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="Email"
                  required
                />

                {inlineError && (
                  <div role="alert" className="text-sm text-red-600 mt-1">
                    {inlineError}
                  </div>
                )}
              </>
            ) : (
              <div aria-live="polite" className="text-sm text-gray-700">
                <p className="mb-2">
                  ✅ If an account with that email exists, you should receive an email with instructions.
                </p>
                <p className="text-xs text-gray-500">
                  Didn't receive it? Check your spam folder or try resending after a moment.
                </p>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            {!sent ? (
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  onClick={handleResend}
                  disabled={loading || cooldown > 0}
                  className="w-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  {loading ? "Sending..." : cooldown > 0 ? `Resend (${cooldown}s)` : "Resend email"}
                </Button>

                <Button
                  type="button"
                  onClick={() => {
                    // allow user to go back to send form (if they want to change email)
                    setSent(false);
                    setInlineError("");
                  }}
                  className="w-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Use a different email
                </Button>
              </div>
            )}

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
