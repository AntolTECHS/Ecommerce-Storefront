// src/pages/AdminDashboard.jsx
import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  ShoppingCart,
  MessageCircle,
  BarChart,
  Package,
  Trash2,
  Eye,
} from "lucide-react";
import API from "../services/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { useToast } from "@/hooks/use-toast.js";
// Optional: enable realtime by installing socket.io-client and uncommenting
// import { io } from "socket.io-client";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [messages, setMessages] = useState([]);
  const [logins, setLogins] = useState([]);
  const [products, setProducts] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add product form state (kept)
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [stock, setStock] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState([]); // will be Array<File>

  // Edit modal state (kept)
  const [editingProduct, setEditingProduct] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editStock, setEditStock] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editExistingImages, setEditExistingImages] = useState([]);
  const [editNewImages, setEditNewImages] = useState([]); // will be Array<File>

  const addFileInputRef = useRef(null);
  const editFileInputRef = useRef(null);

  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const { toast } = useToast();

  // Backend base URL (set via Vite env)
  const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
  // Poll interval (ms) - configurable via env VITE_ADMIN_POLL_INTERVAL_MS
  const POLL_INTERVAL = Number(import.meta.env.VITE_ADMIN_POLL_INTERVAL_MS || 10000);

  // For optional sockets (uncomment import above and this block if you have socket.io-client installed)
  const socketRef = useRef(null);

  // Preview modal for message
  const [previewMessage, setPreviewMessage] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  // Currency formatter for Kenyan shillings
  const formatKES = (value) => {
    const amount = Number(value) || 0;
    return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(amount);
  };

  // Robust image URL resolver: accepts many shapes and falls back to placeholder
  const getImageUrl = (img) => {
    if (!img) return "/placeholder.png";

    // File/Blob preview
    try {
      if (typeof File !== "undefined" && img instanceof File) {
        return URL.createObjectURL(img);
      }
      if (typeof Blob !== "undefined" && img instanceof Blob) {
        return URL.createObjectURL(img);
      }
    } catch (e) {
      // ignore blob problems
    }

    // String values
    if (typeof img === "string") {
      const s = img.trim();
      if (!s) return "/placeholder.png";

      // absolute http(s)
      if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("//")) return s;

      // already starts with slash -> /uploads/...
      if (s.startsWith("/")) return `${API_BASE}${s}`;

      // common backend returns "uploads/filename.jpg" (no leading slash)
      if (/^uploads[\\/]/i.test(s)) return `${API_BASE}/${s.replace(/^\/+/, "")}`;

      // sometimes backend returns just 'filename.jpg' or 'uploads\\file.jpg'
      if (!s.includes("://")) {
        return `${API_BASE}/${s.replace(/^\/+/, "")}`;
      }

      return s;
    }

    // Object shapes: try common fields
    if (typeof img === "object") {
      const tryStr = (v) => (typeof v === "string" && v.trim() ? getImageUrl(v.trim()) : null);
      const candidates = [
        img.url,
        img.url?.raw,
        img.path,
        img.pathname,
        img.filename,
        img.fileName,
        img.src,
        img.image,
        img.thumbnail,
        img.thumb,
      ];
      for (const c of candidates) {
        const resolved = tryStr(c);
        if (resolved) return resolved;
      }
    }

    return "/placeholder.png";
  };

  // Build a map of products by id for fast lookup (helps when order.product is just an id)
  const productsById = useMemo(() => {
    const map = new Map();
    if (Array.isArray(products)) {
      products.forEach((p) => {
        if (p && p._id) map.set(String(p._id), p);
      });
    }
    return map;
  }, [products]);

  // Normalizes "it.product" entry to a product object when possible
  const resolveProduct = (raw) => {
    if (!raw) return null;

    if (typeof raw === "string" || typeof raw === "number") {
      return productsById.get(String(raw)) || { _id: String(raw) };
    }

    if (typeof raw === "object") {
      if (raw._id || raw.id) {
        const found = productsById.get(String(raw._id || raw.id));
        return found || raw;
      }
      return raw;
    }

    return null;
  };

  // small helper to be forgiving about API shapes
  const unwrapArray = (res) => {
    const d = res?.data;
    if (Array.isArray(d)) return d;
    if (Array.isArray(res)) return res;
    if (d?.messages && Array.isArray(d.messages)) return d.messages;
    if (d?.data && Array.isArray(d.data)) return d.data;
    for (const k of ["items", "results", "rows", "list"]) {
      if (Array.isArray(d?.[k])) return d[k];
    }
    return [];
  };

  // Fetch admin data (initial)
  useEffect(() => {
    mountedRef.current = true;
    const fetchAdminData = async () => {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem("token");
      if (!token) {
        setError("No token found!");
        setLoading(false);
        return;
      }
      const config = { headers: { Authorization: `Bearer ${token}` } };

      try {
        // NOTE: fetch messages from /contact (admin-protected)
        const [usersRes, ordersRes, messagesRes, loginsRes, productsRes, analyticsRes] =
          await Promise.all([
            API.get("/admin/users", config),
            API.get("/admin/orders", config),
            API.get("/contact", config), // <--- fetch messages here
            API.get("/admin/logins", config),
            API.get("/admin/products", config),
            API.get("/admin/analytics", config),
          ]);

        const u = unwrapArray(usersRes);
        const o = unwrapArray(ordersRes);
        const m = unwrapArray(messagesRes);
        const l = unwrapArray(loginsRes);
        const p = unwrapArray(productsRes);
        const a = unwrapArray(analyticsRes);

        if (!mountedRef.current) return;
        setUsers(u);
        setOrders(o);
        setMessages(m);
        setLogins(l);
        setProducts(p);
        setAnalytics(a);
      } catch (err) {
        console.error("Fetch admin data error:", err);
        setError(err?.response?.data?.message || "Failed to fetch admin data");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    fetchAdminData();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ---------- Polling: auto-refresh messages count ----------
  useEffect(() => {
    let isMounted = true;
    const token = localStorage.getItem("token");
    if (!token) return; // don't start polling without auth

    const config = { headers: { Authorization: `Bearer ${token}` } };

    const poll = async () => {
      try {
        // poll the same endpoint used by backend for admin messages
        const res = await API.get("/contact", config);
        const m = unwrapArray(res);
        if (!isMounted) return;
        setMessages((prev) => {
          const prevLen = Array.isArray(prev) ? prev.length : 0;
          const newLen = Array.isArray(m) ? m.length : 0;
          if (newLen !== prevLen) {
            if (newLen > prevLen && toast) {
              toast({
                title: "New message received",
                description: `${newLen - prevLen} new message(s)`,
              });
            }
            return m;
          }
          return prev;
        });
      } catch (err) {
        console.debug("Polling messages error", err);
      }
    };

    poll();
    const id = setInterval(poll, Math.max(2000, POLL_INTERVAL));

    return () => {
      isMounted = false;
      clearInterval(id);
    };
  }, [POLL_INTERVAL, toast]);

  // ---------- Optional: WebSocket (Socket.IO) realtime ----------
  // To enable: install socket.io-client and uncomment the import at top.
  // This will keep the messages/users/orders in sync instantly.
  useEffect(() => {
    // if you want, enable sockets by uncommenting import and this block
    // const token = localStorage.getItem("token");
    // if (!token) return;
    // try {
    //   const socket = io(API_BASE, { auth: { token } });
    //   socketRef.current = socket;
    //   socket.on("connect", () => console.debug("socket connected", socket.id));
    //   socket.on("messageCreated", (msg) => {
    //     setMessages(prev => {
    //       const already = Array.isArray(prev) && prev.find(m => String(m._id || m.id) === String(msg._id || msg.id));
    //       if (already) return prev;
    //       if (toast) toast({ title: "New message", description: msg?.subject || "You have a new message" });
    //       return [msg, ...(Array.isArray(prev) ? prev : [])];
    //     });
    //   });
    //   socket.on("messageDeleted", ({ id }) => {
    //     setMessages(prev => (Array.isArray(prev) ? prev.filter(m => String(m._id || m.id) !== String(id)) : prev));
    //   });
    //   socket.on("userDeleted", ({ id }) => {
    //     setUsers(prev => (Array.isArray(prev) ? prev.filter(u => String(u._id || u.id) !== String(id)) : prev));
    //   });
    //   socket.on("orderDeleted", ({ id }) => {
    //     setOrders(prev => (Array.isArray(prev) ? prev.filter(o => String(o._id || o.id) !== String(id)) : prev));
    //   });
    //   socket.on("disconnect", (reason) => console.debug("socket disconnected", reason));
    // } catch (e) {
    //   console.debug("Socket init error", e);
    // }
    // return () => socketRef.current?.disconnect();
  }, [API_BASE, toast]);

  // --- Admin actions ---------------------------------------------------------

  const handleDeleteMessage = async (id) => {
    if (!id) return;
    if (!window.confirm("Delete this message? This action is irreversible.")) return;
    try {
      const token = localStorage.getItem("token");
      await API.delete(`/contact/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setMessages((prev) => (Array.isArray(prev) ? prev.filter((m) => String(m._id || m.id) !== String(id)) : prev));
      toast && toast({ title: "Message deleted" });
    } catch (err) {
      console.error("Delete message error:", err);
      toast && toast({ title: "Failed to delete message", variant: "destructive" });
    }
  };

  const handleDeleteUser = async (id) => {
    if (!id) return;
    if (!window.confirm("Delete this user? This will remove the user from the system.")) return;
    try {
      const token = localStorage.getItem("token");
      await API.delete(`/admin/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setUsers((prev) => (Array.isArray(prev) ? prev.filter((u) => String(u._id || u.id) !== String(id)) : prev));
      toast && toast({ title: "User deleted" });
    } catch (err) {
      console.error("Delete user error", err);
      toast && toast({ title: "Failed to delete user", variant: "destructive" });
    }
  };

  // IMPORTANT: use admin endpoints (/admin/orders/...) — server registers these under /api/admin
  const handleDeleteOrder = async (id) => {
    if (!id) return;
    if (!window.confirm("Delete this order? This cannot be undone.")) return;
    try {
      const token = localStorage.getItem("token");
      await API.delete(`/admin/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setOrders((prev) => (Array.isArray(prev) ? prev.filter((o) => String(o._id || o.id) !== String(id)) : prev));
      toast && toast({ title: "Order deleted" });
    } catch (err) {
      console.error("Delete order error:", err);
      const msg = err?.response?.data?.message || err?.message || "Failed to delete order";
      toast && toast({ title: "Failed to delete order", description: msg, variant: "destructive" });
    }
  };

  // --- Product handlers (unchanged) ---
  const handleAddProduct = async () => {
    const imagesCount = images?.length ?? 0;
    if (!name || !price || !category || !stock || imagesCount === 0) {
      alert("All fields and at least one image are required.");
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("price", price);
    formData.append("category", category);
    formData.append("stock", stock);
    formData.append("description", description || "");
    images.forEach((file) => formData.append("images", file));

    try {
      const token = localStorage.getItem("token");
      const res = await API.post("/admin/products", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setProducts((prev) => [...prev, res.data]);
      setName("");
      setPrice("");
      setCategory("");
      setStock("");
      setDescription("");
      setImages([]);
      if (addFileInputRef.current) addFileInputRef.current.value = "";
      alert("Product added successfully!");
    } catch (err) {
      console.error("Add product error:", err);
      alert(err?.response?.data?.message || "Failed to add product");
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm("Are you sure you want to delete this product? This action cannot be undone.")) return;
    try {
      const token = localStorage.getItem("token");
      await API.delete(`/admin/products/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setProducts((prev) => prev.filter((p) => p._id !== id));
      alert("Product deleted.");
    } catch (err) {
      console.error("Delete product error:", err);
      alert(err?.response?.data?.message || "Failed to delete product");
    }
  };

  const handleStartEdit = (product) => {
    setEditingProduct(product);
    setEditName(product.name || "");
    setEditPrice(product.price || "");
    setEditCategory(product.category || "");
    setEditStock(product.stock || "");
    setEditDescription(product.description || "");
    setEditExistingImages(Array.isArray(product.images) ? product.images : []);
    setEditNewImages([]);
    if (editFileInputRef.current) editFileInputRef.current.value = "";
    setShowEditModal(true);
  };

  const handleCancelEdit = () => {
    setEditingProduct(null);
    setShowEditModal(false);
    setEditExistingImages([]);
    setEditNewImages([]);
    setEditName("");
    setEditPrice("");
    setEditCategory("");
    setEditStock("");
    setEditDescription("");
    if (editFileInputRef.current) editFileInputRef.current.value = "";
  };

  const handleUpdateProduct = async (id) => {
    if (!editName || !editPrice || !editCategory || !editStock) {
      alert("Name, price, category and stock are required.");
      return;
    }

    const formData = new FormData();
    formData.append("name", editName);
    formData.append("price", editPrice);
    formData.append("category", editCategory);
    formData.append("stock", editStock);
    formData.append("description", editDescription || "");
    if (editNewImages && editNewImages.length > 0) {
      editNewImages.forEach((f) => formData.append("images", f));
    }

    try {
      const token = localStorage.getItem("token");
      const res = await API.put(`/admin/products/${id}`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setProducts((prev) => prev.map((p) => (p._id === id ? res.data : p)));
      alert("Product updated successfully!");
      handleCancelEdit();
    } catch (err) {
      console.error("Update product error", err);
      alert(err?.response?.data?.message || "Failed to update product");
    }
  };

  const handleMarkPaid = async (orderId) => {
    if (!window.confirm("Mark this order as paid?")) return;
    try {
      const token = localStorage.getItem("token");
      const res = await API.put(
        `/admin/orders/${orderId}`,
        { isPaid: true, paidAt: new Date().toISOString() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setOrders((prev) => prev.map(o => (String(o._id) === String(orderId) ? res.data : o)));
      toast && toast({ title: "Order marked as paid" });
    } catch (err) {
      console.error("Mark paid error:", err);
      const msg = err?.response?.data?.message || err?.message || "Failed to mark as paid";
      toast && toast({ title: "Failed to mark as paid", description: msg, variant: "destructive" });
    }
  };

  const handleMarkDelivered = async (orderId) => {
    if (!window.confirm("Mark this order as delivered?")) return;
    try {
      const token = localStorage.getItem("token");
      const res = await API.put(
        `/admin/orders/${orderId}`,
        { isDelivered: true, deliveredAt: new Date().toISOString() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setOrders((prev) => prev.map(o => (String(o._id) === String(orderId) ? res.data : o)));
      toast && toast({ title: "Order marked as delivered" });
    } catch (err) {
      console.error("Mark delivered error:", err);
      const msg = err?.response?.data?.message || err?.message || "Failed to mark as delivered";
      toast && toast({ title: "Failed to mark as delivered", description: msg, variant: "destructive" });
    }
  };

  const handleViewOrder = (orderId) => {
    navigate(`/order/${orderId}`);
  };

  // Preview helpers
  const openPreview = (msg) => {
    setPreviewMessage(msg);
    setShowPreview(true);
  };
  const closePreview = () => {
    setPreviewMessage(null);
    setShowPreview(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <p className="text-gray-600 text-lg animate-pulse">Loading admin data...</p>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <p className="text-red-500 text-lg">{error}</p>
    </div>
  );

  const sortedUsers = [...users].sort((a, b) => (a.role === "admin" ? -1 : 1));

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview": {
        // compute total revenue using stable keys (total || totalPrice || derived)
        const revenueSum = orders.reduce((sum, o) => {
          const t = Number(o.total ?? o.totalPrice ?? 0);
          return sum + (Number.isFinite(t) ? t : 0);
        }, 0);

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <Card className="shadow-lg rounded-xl hover:shadow-xl transition">
              <CardHeader><CardTitle>Total Users</CardTitle></CardHeader>
              <CardContent className="text-3xl font-bold text-blue-600">{users.length}</CardContent>
            </Card>

            <Card className="shadow-lg rounded-xl hover:shadow-xl transition">
              <CardHeader><CardTitle>Total Orders</CardTitle></CardHeader>
              <CardContent className="text-3xl font-bold text-green-600">{orders.length}</CardContent>
            </Card>

            <Card className="shadow-lg rounded-xl hover:shadow-xl transition">
              <CardHeader><CardTitle>Total Revenue</CardTitle></CardHeader>
              <CardContent className="text-3xl font-bold text-purple-600">
                {formatKES(revenueSum)}
              </CardContent>
            </Card>

            <Card className="shadow-lg rounded-xl hover:shadow-xl transition">
              <CardHeader><CardTitle>Total Logins</CardTitle></CardHeader>
              <CardContent className="text-3xl font-bold text-indigo-600">{logins.length}</CardContent>
            </Card>

            <Card className="shadow-lg rounded-xl hover:shadow-xl transition col-span-full md:col-span-2">
              <CardHeader><CardTitle>Messages</CardTitle></CardHeader>
              <CardContent className="text-3xl font-bold text-purple-600 flex items-center justify-center">
                {messages.length}
              </CardContent>
            </Card>

            <Card className="shadow-lg rounded-xl hover:shadow-xl transition col-span-full md:col-span-2">
              <CardHeader><CardTitle>Products</CardTitle></CardHeader>
              <CardContent className="text-3xl font-bold text-indigo-600 flex items-center justify-center">
                {products.length}
              </CardContent>
            </Card>

            <Card className="shadow-lg rounded-xl hover:shadow-xl transition col-span-full">
              <CardHeader><CardTitle className="text-center md:text-left">Analytics (Last 7 Days)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={analytics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="orders" stroke="#8884d8" name="Orders" />
                    <Line type="monotone" dataKey="revenue" stroke="#82ca9d" name="Revenue" />
                    <Line type="monotone" dataKey="logins" stroke="#ffc658" name="Logins" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        );
      }

      case "users":
        if (!users.length) return <p className="text-center text-gray-500 mt-6">No users available.</p>;
        return (
          <div className="overflow-x-auto shadow-lg rounded-lg border border-gray-200 mt-4">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-blue-600 to-indigo-600">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">User ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedUsers.map((user, idx) => (
                  <tr key={user._id} className={`${user.role === "admin" ? "bg-red-50 hover:bg-red-100 font-bold" : idx % 2 === 0 ? "bg-blue-50 hover:bg-blue-100" : "bg-white hover:bg-gray-100"} transition-colors duration-200`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-medium">{String(user._id).slice(0, 18)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{user.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{user.role}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                      <div className="flex gap-2">
                        <button onClick={() => handleDeleteUser(user._id)} title="Delete user" className="px-2 py-1 bg-red-600 text-white rounded text-xs flex items-center gap-1">
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case "orders":
        if (!orders.length) return <p className="text-center text-gray-500">No orders available.</p>;

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.map((order) => {
              // compute total robustly
              const total = Number(order.total ?? order.totalPrice ?? 0) || (Array.isArray(order.products) ? order.products.reduce((s, it) => {
                const p = resolveProduct(it.product) || {};
                const unit = Number(p.price ?? p?.unitPrice ?? 0) || 0;
                const qty = Number(it.quantity ?? it.qty ?? 1) || 1;
                return s + unit * qty;
              }, 0) : 0);

              const placed = order.createdAt ? new Date(order.createdAt).toLocaleString() : "—";
              const customerName = order.user?.name || order.user?.email || (order.user ? String(order.user) : "Guest");
              const paymentMethod = order.paymentMethod || "—";

              return (
                <Card key={order._id} className="shadow-lg rounded-xl p-4">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="text-sm font-medium">Order #{String(order._id).slice(0, 18)}</span>
                      <span className="text-xs text-slate-500">{placed}</span>
                    </CardTitle>
                  </CardHeader>

                  <CardContent>
                    <div className="mb-3 text-sm text-slate-700">
                      <div className="flex justify-between mb-1">
                        <span className="font-medium">Customer</span>
                        <span className="text-right text-sm break-words max-w-[160px]">{customerName}</span>
                      </div>

                      <div className="flex justify-between mb-1">
                        <span className="font-medium">Total</span>
                        <span className="text-right font-semibold">{formatKES(total)}</span>
                      </div>

                      <div className="flex justify-between mb-1">
                        <span className="font-medium">Payment</span>
                        <span className="text-right">{paymentMethod}</span>
                      </div>

                      <div className="flex gap-2 mt-2">
                        <div className={`px-2 py-0.5 rounded text-xs font-semibold ${order.isPaid ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}>
                          {order.isPaid ? `Paid${order.paidAt ? ` (${new Date(order.paidAt).toLocaleDateString()})` : ""}` : "Not paid"}
                        </div>
                        <div className={`px-2 py-0.5 rounded text-xs font-semibold ${order.isDelivered ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {order.isDelivered ? `Delivered${order.deliveredAt ? ` (${new Date(order.deliveredAt).toLocaleDateString()})` : ""}` : "Not delivered"}
                        </div>
                      </div>
                    </div>

                    <div className="mb-3 border-t pt-3">
                      <h4 className="text-sm font-semibold mb-2">Shipping</h4>
                      <div className="text-sm text-slate-700">
                        <div>{order.shippingAddress?.address || "—"}</div>
                        <div>{order.shippingAddress?.city || "—"}, {order.shippingAddress?.postalCode || ""}</div>
                        <div>{order.shippingAddress?.country || "—"}</div>
                      </div>
                    </div>

                    <div className="mb-3 border-t pt-3">
                      <h4 className="text-sm font-semibold mb-2">Items</h4>
                      <ul className="space-y-2 max-h-36 overflow-auto">
                        {Array.isArray(order.products) && order.products.length > 0 ? order.products.map((it, idx) => {
                          const prodObj = resolveProduct(it.product) || {};
                          const name = prodObj?.name || prodObj?.title || String(prodObj?._id ?? prodObj) || "Unknown product";
                          const price = Number(prodObj?.price ?? prodObj?.unitPrice ?? 0) || 0;
                          const qty = Number(it.quantity ?? it.qty ?? 1) || 1;
                          const lineTotal = price * qty;

                          const thumbCandidate = Array.isArray(prodObj.images) && prodObj.images.length > 0 ? prodObj.images[0] :
                            (prodObj.image || prodObj.thumbnail || prodObj.src || prodObj.path || prodObj.filename || null);

                          const thumbUrl = getImageUrl(thumbCandidate);

                          return (
                            <li key={String(idx)} className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-md overflow-hidden bg-gray-50 border flex-shrink-0">
                                <img
                                  src={thumbUrl}
                                  alt={name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  onError={(e) => {
                                    if (e.currentTarget.src && !e.currentTarget.src.endsWith("/placeholder.png")) {
                                      e.currentTarget.src = "/placeholder.png";
                                    }
                                  }}
                                />
                              </div>

                              <div className="flex-1 text-sm min-w-0">
                                <div className="font-medium truncate">{name}</div>
                                <div className="text-xs text-slate-500">qty: {qty} — {formatKES(price)}</div>
                              </div>

                              <div className="text-sm font-semibold">{formatKES(lineTotal)}</div>
                            </li>
                          );
                        }) : <li className="text-sm text-slate-500">No items</li>}
                      </ul>
                    </div>

                    {/* Responsive actions: wrap on small screens and align to the right on larger screens */}
                    <div className="mt-4 flex flex-wrap items-center gap-2 justify-end">
                      <Button onClick={() => handleViewOrder(order._id)} className="w-full sm:w-auto px-3 py-2 text-sm">View</Button>
                      <Button onClick={() => handleDeleteOrder(order._id)} className="w-full sm:w-auto px-3 py-2 text-sm bg-red-600 text-white">Delete</Button>
                      {!order.isPaid && (
                        <Button onClick={() => handleMarkPaid(order._id)} className="w-full sm:w-auto px-3 py-2 text-sm bg-green-600 text-white">Mark as Paid</Button>
                      )}
                      {!order.isDelivered && (
                        <Button onClick={() => handleMarkDelivered(order._id)} className="w-full sm:w-auto px-3 py-2 text-sm bg-sky-600 text-white">Mark as Delivered</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        );

      case "messages":
        if (!messages.length) return <p className="text-center text-gray-500">No messages available.</p>;

        return (
          <div className="overflow-x-auto shadow rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-purple-600 to-indigo-600">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Message</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Received</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {messages.map((msg) => {
                  const id = msg._id || msg.id;
                  const snippet = (msg.message || "").length > 120 ? (msg.message || "").slice(0, 120) + "…" : (msg.message || "");
                  return (
                    <tr key={id}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 font-medium">{msg.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 break-words max-w-xs">{msg.email}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{msg.subject || "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 max-w-md break-words">{snippet}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{msg.createdAt ? new Date(msg.createdAt).toLocaleString() : "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        <div className="flex gap-2">
                          <button onClick={() => openPreview(msg)} title="Preview" className="px-2 py-1 bg-slate-200 rounded text-xs flex items-center gap-1">
                            <Eye className="w-3 h-3" /> Preview
                          </button>
                          <button onClick={() => handleDeleteMessage(id)} title="Delete" className="px-2 py-1 bg-red-600 text-white rounded text-xs flex items-center gap-1">
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* preview modal */}
            {showPreview && previewMessage && (
              <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">{previewMessage.subject || `${previewMessage.name} — ${previewMessage.email}`}</h3>
                      <p className="text-xs text-gray-500 mt-1">{previewMessage.createdAt ? new Date(previewMessage.createdAt).toLocaleString() : ""}</p>
                    </div>
                    <div>
                      <button onClick={() => { handleDeleteMessage(previewMessage._id || previewMessage.id); closePreview(); }} className="px-3 py-1 rounded bg-red-600 text-white text-sm">Delete</button>
                      <button onClick={closePreview} className="ml-2 px-3 py-1 rounded border text-sm">Close</button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="whitespace-pre-wrap text-sm text-gray-800">{previewMessage.message}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case "products":
        return (
          <div className="space-y-6">
            {/* Add New Product */}
            <Card className="p-6 shadow-xl rounded-2xl max-w-xl mx-auto bg-gradient-to-r from-indigo-50 via-white to-blue-50 border border-gray-200">
              <CardHeader><CardTitle className="text-center text-xl font-bold text-gray-800">Add New Product</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <input className="w-full p-2 border rounded-lg" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
                <input className="w-full p-2 border rounded-lg" placeholder="Price (amount only, stored as number)" type="number" value={price} onChange={e => setPrice(e.target.value)} />
                <input className="w-full p-2 border rounded-lg" placeholder="Category" value={category} onChange={e => setCategory(e.target.value)} />
                <input className="w-full p-2 border rounded-lg" placeholder="Stock" type="number" value={stock} onChange={e => setStock(e.target.value)} />
                <textarea className="w-full p-2 border rounded-lg" placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} />
                <input
                  ref={addFileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setImages(Array.from(e.target.files || []))}
                  className="w-full"
                />
                {images && images.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {images.map((f, i) => (
                      <div key={i} className="flex flex-col items-center text-xs">
                        <img src={getImageUrl(f)} alt={`preview-${i}`} className="w-20 h-20 object-cover rounded" />
                        <span className="max-w-[80px] truncate">{f.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Button className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:from-indigo-600 hover:to-blue-500 hover:shadow-xl transition-all duration-300" onClick={handleAddProduct}>Add Product</Button>
              </CardContent>
            </Card>

            {/* Product Grid (kept) */}
            {products.length === 0 ? <p className="text-center text-gray-500">No products available.</p> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {products.map((p) => (
                  <Card
                    key={p._id}
                    className="group relative p-0 rounded-2xl shadow-lg bg-white border border-gray-100 hover:shadow-2xl hover:scale-105 transform transition-all duration-300 mx-auto overflow-hidden flex flex-col h-full"
                  >
                    <div className="w-full h-48 md:h-56 overflow-hidden bg-gray-100 flex-shrink-0">
                      <img
                        src={getImageUrl(Array.isArray(p.images) ? p.images[0] : (p.images || ""))}
                        alt={p.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { if (!e.currentTarget.src.endsWith("/placeholder.png")) e.currentTarget.src = "/placeholder.png"; }}
                        loading="lazy"
                      />
                    </div>

                    <CardContent className="p-4 flex-1 min-h-0 flex flex-col">
                      <h3 className="text-lg font-semibold leading-snug break-words">{p.name}</h3>

                      <p
                        className="text-sm text-gray-600 mt-2"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {p.description || "No description provided."}
                      </p>

                      <div className="mt-3 flex items-center justify-between text-sm text-gray-500 min-w-0">
                        <span className="capitalize break-words">{p.category || "Uncategorized"}</span>
                        <span className="font-medium">{`Stock: ${p.stock ?? 0}`}</span>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="text-xl font-bold text-gray-900 break-words min-w-0">{formatKES(p.price)}</div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleStartEdit(p)}
                            className="px-3 py-1 rounded-full bg-white bg-opacity-90 text-sm font-medium shadow hover:bg-opacity-100"
                            title="Edit"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(p._id)}
                            className="px-3 py-1 rounded-full bg-red-600 text-xs text-white font-semibold shadow hover:bg-red-700"
                            title="Delete"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {Array.isArray(p.images) && p.images.length > 1 && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {p.images.slice(1, 4).map((img, idx) => (
                            <img key={idx} src={getImageUrl(img)} alt={`${p.name}-${idx}`} className="w-full h-16 object-cover rounded-lg" loading="lazy" onError={(e)=> { if (!e.currentTarget.src.endsWith("/placeholder.png")) e.currentTarget.src = "/placeholder.png"; }} />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-50 bg-gradient-to-r from-gray-800 via-gray-900 to-black shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between">
          <h2 className="text-2xl font-bold text-white tracking-wide mb-3 md:mb-0 text-center md:text-left">Admin Dashboard</h2>
          <nav className="flex flex-wrap gap-2 justify-center relative">
            <Button variant="ghost" onClick={() => setActiveTab("overview")} className={`${activeTab === "overview" ? "bg-white text-gray-900 font-semibold shadow" : "text-gray-200 hover:text-white"} rounded-full px-4 py-2 transition`}><BarChart className="mr-2 h-4 w-4" /> Overview</Button>
            <Button variant="ghost" onClick={() => setActiveTab("users")} className={`${activeTab === "users" ? "bg-white text-gray-900 font-semibold shadow" : "text-gray-200 hover:text-white"} rounded-full px-4 py-2 transition relative`}><Users className="mr-2 h-4 w-4" /> Users <span className="absolute -top-1 -right-2 bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{users.length || 0}</span></Button>
            <Button variant="ghost" onClick={() => setActiveTab("orders")} className={`${activeTab === "orders" ? "bg-white text-gray-900 font-semibold shadow" : "text-gray-200 hover:text-white"} rounded-full px-4 py-2 transition relative`}><ShoppingCart className="mr-2 h-4 w-4" /> Orders <span className="absolute -top-1 -right-2 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{orders.length || 0}</span></Button>
            <Button variant="ghost" onClick={() => setActiveTab("messages")} className={`${activeTab === "messages" ? "bg-white text-gray-900 font-semibold shadow" : "text-gray-200 hover:text-white"} rounded-full px-4 py-2 transition relative`}><MessageCircle className="mr-2 h-4 w-4" /> Messages <span className="absolute -top-1 -right-2 bg-purple-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{messages.length || 0}</span></Button>
            <Button variant="ghost" onClick={() => setActiveTab("products")} className={`${activeTab === "products" ? "bg-white text-gray-900 font-semibold shadow" : "text-gray-200 hover:text-white"} rounded-full px-4 py-2 transition relative`}><Package className="mr-2 h-4 w-4" /> Products <span className="absolute -top-1 -right-2 bg-indigo-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{products.length || 0}</span></Button>
          </nav>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {renderTabContent()}
      </main>

      {/* Edit Modal (same UI as before) */}
      {showEditModal && editingProduct && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Edit Product</h3>
              <button onClick={handleCancelEdit} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1 w-full p-2 border rounded" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Price</label>
                <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="mt-1 w-full p-2 border rounded" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Category</label>
                <input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="mt-1 w-full p-2 border rounded" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Stock</label>
                <input type="number" value={editStock} onChange={(e) => setEditStock(e.target.value)} className="mt-1 w-full p-2 border rounded" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="mt-1 w-full p-2 border rounded h-24" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Existing Images (kept unless you upload new ones)</label>
                <div className="flex gap-2 mt-2">
                  {(!editExistingImages || editExistingImages.length === 0) ? <p className="text-gray-500">No images</p> :
                    editExistingImages.map((src, i) => (
                      <img key={i} src={getImageUrl(src)} alt={`existing-${i}`} className="w-20 h-20 object-cover rounded" onError={(e)=> { if (!e.currentTarget.src.endsWith("/placeholder.png")) e.currentTarget.src = "/placeholder.png"; }} />
                    ))
                  }
                </div>

                <label className="block text-sm font-medium text-gray-700 mt-3">Upload new images (optional — will replace existing)</label>
                <input
                  ref={editFileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setEditNewImages(Array.from(e.target.files || []))}
                  className="mt-2"
                />

                {editNewImages && editNewImages.length > 0 && (
                  <div className="flex gap-2 mt-3">
                    {editNewImages.map((f, i) => (
                      <img key={i} src={getImageUrl(f)} alt={`preview-${i}`} className="w-20 h-20 object-cover rounded" />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={handleCancelEdit} className="px-4 py-2 rounded-md border">Cancel</button>
              <button onClick={() => handleUpdateProduct(editingProduct._id)} className="px-4 py-2 rounded-md bg-gradient-to-r from-green-500 to-emerald-600 text-white">Save changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
