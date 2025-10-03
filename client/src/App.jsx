// src/App.jsx
import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import ProtectedRoute from "@/components/ProtectedRoute";

// Lazy-load all pages
const Index = lazy(() => import("./pages/Index.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Signup = lazy(() => import("./pages/SignUp.jsx"));
const ProductDetails = lazy(() => import("./pages/ProductDetails.jsx"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));

// Checkout/order pages
const Checkout = lazy(() => import("@/pages/Checkout.jsx"));
const OrderSuccess = lazy(() => import("@/pages/OrderSuccess.jsx"));
const OrderDetails = lazy(() => import("@/pages/OrderDetails.jsx"));

// Account pages
const AccountLayout = lazy(() => import("@/pages/account/AccountLayout.jsx"));
const Profile = lazy(() => import("@/pages/account/Profile.jsx"));
const MyOrders = lazy(() => import("@/pages/account/MyOrders.jsx"));
const Settings = lazy(() => import("@/pages/account/Settings.jsx"));

// Contact page
const ContactPage = lazy(() => import("@/pages/ContactPage.jsx"));

// Password reset pages
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword.jsx"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword.jsx"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
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

            {/* Account routes (protected) */}
            <Route
              path="/account/*"
              element={
                <ProtectedRoute>
                  <AccountLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Profile />} />
              <Route path="profile" element={<Profile />} />
              <Route path="orders" element={<MyOrders />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            {/* Top-level protected routes */}
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

            {/* Admin */}
            <Route
              path="/admin/dashboard/*"
              element={
                <ProtectedRoute adminOnly={true}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
