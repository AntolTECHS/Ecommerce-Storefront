// src/App.jsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Index from "./pages/Index.jsx";
import NotFound from "./pages/NotFound.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/SignUp.jsx";
import ProductDetails from "./pages/ProductDetails.jsx";
import AdminDashboard from "@/pages/AdminDashboard";
import ProtectedRoute from "@/components/ProtectedRoute";

// Checkout/order pages
import Checkout from "@/pages/Checkout.jsx";
import OrderSuccess from "@/pages/OrderSuccess.jsx";
import OrderDetails from "@/pages/OrderDetails.jsx";

// Account pages & layout
import AccountLayout from "@/pages/account/AccountLayout.jsx";
import Profile from "@/pages/account/Profile.jsx";
import MyOrders from "@/pages/account/MyOrders.jsx";
import Settings from "@/pages/account/Settings.jsx";

// Contact page
import ContactPage from "@/pages/ContactPage.jsx";

// Password reset pages
import ForgotPassword from "@/pages/ForgotPassword.jsx";
import ResetPassword from "@/pages/ResetPassword.jsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Index />} />
          <Route path="/product/:id" element={<ProductDetails />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/contact" element={<ContactPage />} />

          {/* Password reset */}
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />

          {/* Checkout routes */}
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/order-success" element={<OrderSuccess />} />
          <Route path="/order/:id" element={<OrderDetails />} />

          {/* Account routes (protected, nested under /account) */}
          <Route
            path="/account/*"
            element={
              <ProtectedRoute>
                <AccountLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Profile />} />             {/* /account -> Profile */}
            <Route path="profile" element={<Profile />} />   {/* /account/profile */}
            <Route path="orders" element={<MyOrders />} />   {/* /account/orders */}
            <Route path="settings" element={<Settings />} /> {/* /account/settings */}
          </Route>

          {/* Top-level protected routes (for header/menu links) */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <MyOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin/dashboard/*"
            element={
              <ProtectedRoute adminOnly={true}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Catch-all 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
