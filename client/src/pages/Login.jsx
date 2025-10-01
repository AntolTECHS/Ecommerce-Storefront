import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react"; // 👈 icons for toggle
import API from "../services/api";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // 👈 new state
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // NEW: inline error state shown under the form
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    if (e?.preventDefault) e.preventDefault();

    // reset previous error
    setError(null);

    if (!email || !password) {
      const msg = "All fields are required";
      setError(msg);
      toast({ title: "Missing fields", description: msg, variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await API.post("/auth/login", { email, password });

      if (!res.data?.token) {
        const msg = "Login failed: no token received";
        setError(msg);
        toast({ title: "Login failed", description: msg, variant: "destructive" });
        return;
      }

      const { user, token } = res.data;

      localStorage.setItem("token", token);
      localStorage.setItem(
        "user",
        JSON.stringify({
          name: user.name,
          email: user.email,
          role: user.role?.toLowerCase() || "user",
        })
      );

      toast({
        title: "Welcome back",
        description: `Hello ${user.name || user.email}`,
      });

      // navigate after successful login
      if (user.role?.toLowerCase() === "admin") {
        navigate("/admin/dashboard");
      } else {
        navigate("/");
      }
    } catch (err) {
      // prefer server-provided message when available
      const serverMsg =
        err?.response?.data?.message ||
        (err?.response?.status === 401 ? "Invalid email or password" : null);

      const genericMsg = "Unable to log in. Check your credentials.";

      const finalMsg = serverMsg || genericMsg;

      // set inline error and show toast
      setError(finalMsg);
      console.error("Login error:", err?.response?.data || err?.message || err);
      toast({
        title: "Login failed",
        description: finalMsg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <Card className="w-full max-w-md bg-gray-100 shadow-xl animate-fade">
        <form onSubmit={handleLogin} className="space-y-6">
          <CardHeader>
            <CardTitle className="text-center text-2xl font-bold">Log In</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* inline error (accessible) */}
            {error && (
              <div className="rounded-md bg-red-50 p-2 text-sm text-red-700" role="alert" aria-live="assertive">
                {error}
              </div>
            )}

            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email"
              required
            />

            {/* Password field with toggle */}
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label="Password"
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-700 text-white hover:bg-gray-800 transition-colors"
            >
              {loading ? "Logging in..." : "Log In"}
            </Button>

            <p className="text-sm text-center text-zinc-600">
              <Link to="/forgot-password" className="text-blue-600 hover:underline">
                Forgot Password?
              </Link>
            </p>

            <p className="text-sm text-center text-zinc-600">
              Don&apos;t have an account?{" "}
              <Link to="/signup" className="text-blue-600 hover:underline">
                Sign Up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
