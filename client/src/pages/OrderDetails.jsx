// src/pages/OrderDetails.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API from "@/services/api";
import { Button } from "@/components/ui/button";

/**
 * OrderDetails page
 * - Fetches order by id (requires auth token)
 * - If product objects in order are not populated or missing images,
 *   fetches product details individually to obtain images.
 * - Builds absolute image URLs using VITE_API_URL or fallback base.
 */

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Backend base URL override via VITE_API_URL; default to localhost:5000
  const BACKEND_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

  const formatKES = useMemo(
    () =>
      new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: "KES",
        maximumFractionDigits: 2,
      }).format,
    []
  );

  useEffect(() => {
    let active = true;

    const fetchOrderAndProducts = async () => {
      try {
        setLoading(true);
        setError("");

        const token = localStorage.getItem("token");
        if (!token) {
          navigate("/login", { replace: true });
          return;
        }

        // fetch order
        const { data: orderData } = await API.get(`/orders/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!active) return;

        // orderData.products is expected to be an array of { product, quantity }
        // product may be either an object or an id string.
        const prods = orderData.products || [];

        // find which product entries need additional fetching:
        // - product is not an object
        // - OR product is object but has no images array or empty images
        const toFetchIds = [];
        const seen = new Set();
        prods.forEach((entry) => {
          const prod = entry.product;
          const idStr = typeof prod === "string" ? prod : prod?._id || prod?.id;
          const hasImages = prod && (Array.isArray(prod.images) && prod.images.length > 0);
          if (!hasImages && idStr && !seen.has(String(idStr))) {
            seen.add(String(idStr));
            toFetchIds.push(String(idStr));
          }
        });

        // fetch missing product details in parallel
        const fetchedMap = {}; // id -> product object
        if (toFetchIds.length > 0) {
          // Use Promise.all to fetch only the necessary product endpoints
          await Promise.all(
            toFetchIds.map(async (pid) => {
              try {
                const res = await API.get(`/products/${pid}`, {
                  headers: { Authorization: `Bearer ${token}` }, // in case product endpoint needs auth
                });
                fetchedMap[pid] = res.data;
              } catch (err) {
                // swallow individual product fetch errors — we'll fallback to placeholder
                console.warn("Failed to fetch product", pid, err?.response?.data || err);
                fetchedMap[pid] = null;
              }
            })
          );
        }

        // Build a merged order object where each product entry has a populated 'product' object (if possible)
        const mergedProducts = prods.map((entry) => {
          const prod = entry.product;
          let prodObj = null;
          if (typeof prod === "string" || typeof prod === "number") {
            prodObj = fetchedMap[String(prod)] || { _id: String(prod) };
          } else if (prod && typeof prod === "object") {
            // already an object: prefer it but fill images from fetchedMap if missing
            const pid = prod._id || prod.id;
            if ((!Array.isArray(prod.images) || prod.images.length === 0) && pid && fetchedMap[String(pid)]) {
              prodObj = { ...fetchedMap[String(pid)], ...prod };
            } else {
              prodObj = prod;
            }
          } else {
            prodObj = { _id: undefined };
          }
          return {
            ...entry,
            product: prodObj,
          };
        });

        const mergedOrder = { ...orderData, products: mergedProducts };

        if (!active) return;
        setOrder(mergedOrder);
      } catch (err) {
        console.error("Failed to fetch order:", err?.response?.data || err);
        const status = err?.response?.status;
        if (status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        if (status === 404) setError("Order not found");
        else if (status === 403) setError("You are not authorized to view this order");
        else setError(err?.response?.data?.message || "Failed to load order");
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchOrderAndProducts();
    return () => {
      active = false;
    };
  }, [id, navigate, BACKEND_BASE]);

  // Helper to compute an absolute thumbnail URL from product data
  const thumbForProduct = (prod) => {
    // priorities:
    // 1) prod.images[0] if present (could be '/uploads/...' or full URL)
    // 2) prod.image if present
    // 3) fallback to placeholder
    const rawThumb = (prod && (prod.images?.[0] || prod.image)) || "/placeholder.png";

    if (rawThumb.startsWith("http://") || rawThumb.startsWith("https://")) {
      return rawThumb;
    }
    // ensure it starts with a slash
    const normalized = rawThumb.startsWith("/") ? rawThumb : `/${rawThumb}`;
    return `${BACKEND_BASE}${normalized}`;
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-3/4 bg-gray-200 rounded"></div>
          <div className="h-5 w-1/2 bg-gray-200 rounded"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="h-40 bg-gray-200 rounded" />
            <div className="h-40 bg-gray-200 rounded md:col-span-2" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded mb-4">
          {error}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Back
          </Button>
          <Button onClick={() => navigate("/login")}>Log in</Button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p>No order data.</p>
        <Button onClick={() => navigate(-1)}>Back</Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-extrabold">Order</h1>
        <div className="mt-2 text-sm text-slate-600">
          <span className="font-mono text-base break-words">{order._id}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: details */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white shadow rounded-2xl p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-slate-500">Placed</div>
                <div className="text-base font-medium">{new Date(order.createdAt).toLocaleString()}</div>
              </div>

              <div className="text-right">
                <div className="text-sm text-slate-500">Total</div>
                <div className="text-lg font-semibold">{formatKES(order.total)}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 items-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-sm">
                <span className="font-medium">Payment</span>
                <span className="text-slate-700">{order.paymentMethod}</span>
              </div>

              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${order.isPaid ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}>
                {order.isPaid ? "Paid" : "Not paid"}
              </div>

              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${order.isDelivered ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {order.isDelivered ? "Delivered" : "Not delivered"}
              </div>
            </div>

            <div className="mt-6 border-t pt-4">
              <h3 className="text-sm font-semibold mb-2">Shipping Address</h3>
              <div className="text-sm text-slate-700 leading-relaxed">
                <div>{order.shippingAddress?.address}</div>
                <div>{order.shippingAddress?.city}, {order.shippingAddress?.postalCode}</div>
                <div>{order.shippingAddress?.country}</div>
              </div>
            </div>

            {order.paymentResult && (
              <div className="mt-4 border-t pt-4 text-sm">
                <h4 className="font-semibold">Payment result</h4>
                <div>ID: {order.paymentResult.id}</div>
                <div>Status: {order.paymentResult.status}</div>
                {order.paymentResult.email_address && <div>Email: {order.paymentResult.email_address}</div>}
              </div>
            )}
          </div>

          {/* Items list */}
          <div className="bg-white shadow rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-4">Items</h3>
            <ul className="space-y-4">
              {order.products?.map((p) => {
                const prod = p.product || {};
                const thumbUrl = thumbForProduct(prod);

                return (
                  <li key={p.product?._id || p.product} className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-md overflow-hidden bg-gray-50 border flex-shrink-0">
                      <img
                        src={thumbUrl}
                        alt={prod.name || "Product"}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = "/placeholder.png";
                        }}
                      />
                    </div>

                    <div className="flex-1">
                      <div className="text-sm font-medium">{prod.name ?? String(p.product)}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        qty: <span className="font-medium">{p.quantity}</span> — <span className="font-mono">{formatKES(prod.price ?? 0)}</span>
                      </div>
                    </div>

                    <div className="text-sm font-semibold">{formatKES((prod.price ?? 0) * (p.quantity ?? 1))}</div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Right column: summary + actions */}
        <aside className="space-y-4">
          <div className="bg-white shadow rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Order summary</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Items</span><span>{formatKES(order.itemsPrice ?? (order.products?.reduce((s, it) => s + ((it.product?.price ?? 0) * (it.quantity ?? 1)), 0)))}</span></div>
              <div className="flex justify-between"><span>Tax</span><span>{formatKES(order.taxPrice ?? 0)}</span></div>
              <div className="flex justify-between"><span>Shipping</span><span>{formatKES(order.shippingPrice ?? 0)}</span></div>
              <div className="border-t pt-3 flex justify-between text-base font-semibold"><span>Total</span><span>{formatKES(order.total)}</span></div>
            </div>

            <div className="mt-4">
              <Button className="w-full" onClick={() => navigate(-1)}>Back</Button>
            </div>
          </div>

          <div className="bg-white shadow rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Actions</h4>
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => navigator.clipboard?.writeText(window.location.href)}>
                Copy link
              </Button>
              <Button onClick={() => window.print()}>Print</Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
