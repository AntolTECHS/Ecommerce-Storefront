import { useEffect, useState, useRef } from "react";
import API from "@/services/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast.js";

/**
 * MyOrders with image health check and thumbnail in list.
 * - Resolves image URLs (handles many shapes)
 * - Treats literal 'placeholder'/'<none>' as missing
 * - Shows thumbnail for each order (first valid item's image)
 * - Prefetches images from API host using Authorization -> object URLs
 * - Tests each URL using a browser Image() object and reports OK / ERROR
 * - Prevents img onError loops (uses data-uri placeholder)
 */

export default function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [imageStatus, setImageStatus] = useState({});
  const [protectedMap, setProtectedMap] = useState({}); // originalUrl -> objectUrl
  const { toast } = useToast();
  const mounted = useRef(true);
  const revokeList = useRef([]);

  useEffect(() => {
    return () => {
      mounted.current = false;
      // revoke created object URLs
      revokeList.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          // ignore
        }
      });
    };
  }, []);

  const baseURL = (() => {
    if (typeof window === "undefined") return "http://localhost:5000";
    if (window.__API_URL__) return window.__API_URL__;
    if (window.__REACT_APP_API_URL__) return window.__REACT_APP_API_URL__;
    if (window.location.port === "5173") {
      return `${window.location.protocol}//${window.location.hostname}:5000`;
    }
    return window.location.origin;
  })();

  const _svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="100%" height="100%" fill="#f3f4f6"/><g fill="#9ca3af"><rect x="28" y="44" width="104" height="72" rx="6" /></g></svg>';
  const PLACEHOLDER_DATA_URI = "data:image/svg+xml;utf8," + encodeURIComponent(_svg);

  /** normalize candidate to a single URL string or null */
  const resolveImage = (candidate) => {
    if (!candidate) return null;
    if (typeof candidate === "object" && candidate.default)
      return resolveImage(candidate.default);

    if (typeof candidate === "string") {
      const s = candidate.trim();
      if (!s) return null;
      if (s.toLowerCase() === "placeholder" || s === "<none>") return null;
      if (s.startsWith("data:")) return s;
      if (s.startsWith("//")) return window.location.protocol + s;
      if (/^https?:\/\//i.test(s)) return encodeURI(s);
      return encodeURI(s.replace(/\s/g, "%20"));
    }

    if (Array.isArray(candidate)) {
      for (const el of candidate) {
        const r = resolveImage(el);
        if (r) return r;
      }
      return null;
    }

    if (typeof candidate === "object") {
      if (candidate.proxyImage) return resolveImage(candidate.proxyImage);

      const keys = [
        "url",
        "path",
        "src",
        "proxyImage",
        "image",
        "filename",
        "file",
        "publicUrl",
        "location",
        "thumbnail",
        "imageUrl",
      ];
      for (const k of keys) {
        if (candidate[k] && typeof candidate[k] === "string")
          return resolveImage(candidate[k]);
      }
      for (const v of Object.values(candidate)) {
        if (typeof v === "string" && v.trim()) return resolveImage(v);
      }
    }

    return null;
  };

  const normalizeOrder = (o) => {
    const id = o._id || o.id || (o._doc && o._doc._id) || null;
    const createdAt = o.createdAt || o.created_at || o.created || null;
    const total = Number(
      o.total ?? o.totalPrice ?? o.itemsPrice ?? o.subtotal ?? 0
    );
    const status =
      o.status || (o.isDelivered ? "delivered" : o.isPaid ? "paid" : "pending");

    const incomingItems = Array.isArray(o.products)
      ? o.products
      : Array.isArray(o.orderItems)
      ? o.orderItems
      : Array.isArray(o.items)
      ? o.items
      : [];

    const items = incomingItems.map((it) => {
      const productObj =
        it.product || it.productId || it._id || it.product_id || null;
      const populated = typeof productObj === "object" && productObj !== null;

      const name =
        it.name ||
        it.productName ||
        (populated && (productObj.name || productObj.title)) ||
        (typeof productObj === "string" ? productObj : "Product");

      const price = Number(
        it.price ??
          it.unitPrice ??
          (populated
            ? productObj.price ?? productObj.unitPrice
            : undefined) ??
          0
      );

      const quantity = Number(
        it.quantity ?? it.qty ?? it.count ?? it.quantityOrdered ?? 1
      );

      // --- IMAGE EXTRACTION ---
      let candidateImage =
        it.image || it.thumbnail || it.photo || it.src || it.url || null;

      if (!candidateImage && populated) {
        if (Array.isArray(productObj.images) && productObj.images.length > 0) {
          candidateImage = productObj.images[0];
        } else if (productObj.proxyImage) {
          candidateImage = productObj.proxyImage;
        } else if (productObj.image) {
          candidateImage = productObj.image;
        } else if (productObj.photo) {
          candidateImage = productObj.photo;
        } else if (productObj.thumbnail) {
          candidateImage = productObj.thumbnail;
        } else if (productObj._doc) {
          if (
            Array.isArray(productObj._doc.images) &&
            productObj._doc.images.length > 0
          ) {
            candidateImage = productObj._doc.images[0];
          } else if (productObj._doc.image) {
            candidateImage = productObj._doc.image;
          }
        }
      }

      let image = resolveImage(candidateImage);
      const resolvedBeforeJoin = image;

      if (image && !/^https?:\/\//i.test(image) && !image.startsWith("data:")) {
        const trimmed = String(image).replace(/^\/+/, "");
        image = `${baseURL.replace(/\/+$/, "")}/${trimmed}`;
      }

      return {
        name,
        price,
        quantity,
        image: image || PLACEHOLDER_DATA_URI,
        _rawCandidate: candidateImage || "<none>",
        _resolvedBeforeJoin: resolvedBeforeJoin || "<none>",
      };
    });

    return { id, createdAt, total, status, items, raw: o };
  };

  const testImageUrl = (url) => {
    if (!url) return;
    if (url === PLACEHOLDER_DATA_URI) {
      setImageStatus((s) => ({ ...s, [url]: "placeholder" }));
      return;
    }

    setImageStatus((prev) => {
      if (prev[url] === "testing" || prev[url] === "ok") return prev;
      return { ...prev, [url]: "testing" };
    });

    try {
      const img = new window.Image();
      img.crossOrigin = "anonymous";

      let done = false;
      const timeoutMs = 8000;

      const finish = (state, reason) => {
        if (done) return;
        done = true;
        if (!mounted.current) return;
        setImageStatus((s) => ({ ...s, [url]: state }));
        console.log("Image test result:", url, "->", state, reason || "");
      };

      img.onload = () => finish("ok");
      img.onerror = (e) => finish("error", e.type || "load error");
      img.src = url;

      setTimeout(() => finish("error", "timeout"), timeoutMs);
    } catch (err) {
      console.error("testImageUrl exception:", err);
      setImageStatus((s) => ({ ...s, [url]: "error" }));
    }
  };

  const probeImageWithAuth = async (url) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return null;
      const res = await fetch(url, {
        method: "HEAD",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return { ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  const prefetchProtectedImages = async (normalized) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const map = {};
    const tasks = [];

    for (const ord of normalized) {
      for (const it of ord.items) {
        const url = it.image;
        if (!url || url.startsWith("data:") || url === PLACEHOLDER_DATA_URI) continue;

        try {
          const parsed = new URL(url, window.location.href);
          const apiHost = new URL(baseURL).host;
          const isApiHost = parsed.host === apiHost;
          if (!isApiHost) continue;
        } catch (e) {
          continue;
        }

        const p = (async () => {
          try {
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) {
              console.debug("Protected image fetch failed for", url, res.status);
              return;
            }
            const blob = await res.blob();
            const objUrl = URL.createObjectURL(blob);
            revokeList.current.push(objUrl);
            map[url] = objUrl;
          } catch (e) {
            console.debug("Protected image fetch error", url, e);
          }
        })();
        tasks.push(p);
      }
    }

    await Promise.all(tasks);
    if (mounted.current) setProtectedMap((p) => ({ ...p, ...map }));
  };

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (!token) {
        toast?.({
          title: "Please login",
          description: "You must be logged in to view orders",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      try {
        const res = await API.get("/orders/myorders", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const raw = res.data;
        console.log("MyOrders: raw response from /orders/myorders:", raw);

        const arr = Array.isArray(raw)
          ? raw
          : Array.isArray(raw.orders)
          ? raw.orders
          : raw.data ?? [];
        const normalized = arr.map(normalizeOrder);

        console.table(
          normalized.flatMap((n) =>
            n.items.map((it) => ({
              orderId: n.id,
              rawCandidate: it._rawCandidate,
              resolvedBeforeJoin: it._resolvedBeforeJoin,
              final: String(it.image).slice(0, 200),
            }))
          )
        );

        console.log("MyOrders: normalized orders (first 5):", normalized.slice(0, 5));

        setOrders(normalized);
        if (normalized.length) setSelected(normalized[0]);

        normalized.forEach((ord) => {
          ord.items.forEach((it) => {
            if (it.image && it.image !== PLACEHOLDER_DATA_URI) {
              testImageUrl(it.image);
              probeImageWithAuth(it.image).then((r) =>
                console.debug &&
                  console.debug("probeImageWithAuth", {
                    url: it.image,
                    result: r,
                  })
              );
            } else if (it.image === PLACEHOLDER_DATA_URI) {
              setImageStatus((s) => ({ ...s, [it.image]: "placeholder" }));
            }
          });
        });

        prefetchProtectedImages(normalized).catch((e) =>
          console.debug("prefetchProtectedImages error", e)
        );
      } catch (err) {
        console.error("Fetch orders error:", err);
        toast?.({ title: "Failed to load orders", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [toast]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white rounded-2xl p-4 shadow">
        <h3 className="font-semibold text-lg mb-4">My Orders</h3>

        {loading ? (
          <div className="text-center p-8">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="text-center p-8">You have no orders yet.</div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              // ✅ pick first item with a usable image, fallback to first
              const firstItem =
                o.items.find(
                  (it) => it.image && it.image !== PLACEHOLDER_DATA_URI
                ) || o.items[0] || null;

              if (firstItem) {
                console.debug(
                  "Thumbnail picked for order",
                  o.id,
                  ":",
                  firstItem.name,
                  firstItem.image
                );
              } else {
                console.debug("No items with images found for order", o.id);
              }

              const firstSrc =
                (firstItem && protectedMap[firstItem.image]) ||
                (firstItem && firstItem.image) ||
                PLACEHOLDER_DATA_URI;

              return (
                <div
                  key={o.id || Math.random()}
                  className="p-3 border rounded flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-50 rounded overflow-hidden flex-shrink-0">
                      <img
                        src={firstSrc}
                        alt={firstItem ? firstItem.name : "order image"}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          if (e.currentTarget.dataset.errored) return;
                          e.currentTarget.dataset.errored = "1";
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = PLACEHOLDER_DATA_URI;
                        }}
                      />
                    </div>

                    <div>
                      <div className="font-medium">Order #{o.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.createdAt ? new Date(o.createdAt).toLocaleString() : ""}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold">
                      {o.total ? `Ksh ${o.total.toLocaleString()}` : ""}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(o)}>
                      View
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <aside className="bg-white rounded-2xl p-4 shadow h-fit">
        <h4 className="font-medium mb-3">Order Details</h4>
        {!selected ? (
          <div className="text-sm text-muted-foreground">Select an order to view details</div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm">
              <strong>Order:</strong> {selected.id}
            </div>
            <div className="text-sm">
              <strong>Status:</strong> {selected.status || "N/A"}
            </div>

            <div>
              <div className="text-sm font-medium mt-2">Items</div>
              <div className="space-y-2 mt-2 max-h-56 overflow-auto">
                {selected.items.map((it, idx) => {
                  const status = imageStatus[it.image] || "unknown";
                  const shownSrc = protectedMap[it.image] || it.image || PLACEHOLDER_DATA_URI;
                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="relative w-16 h-16 bg-gray-50 rounded overflow-hidden">
                        <img
                          src={shownSrc}
                          alt={it.name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            if (e.currentTarget.dataset.errored) return;
                            e.currentTarget.dataset.errored = "1";
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = PLACEHOLDER_DATA_URI;
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            top: 4,
                            left: 4,
                            background:
                              status === "ok"
                                ? "rgba(16,185,129,0.95)"
                                : status === "testing"
                                ? "rgba(59,130,246,0.95)"
                                : status === "error"
                                ? "rgba(239,68,68,0.95)"
                                : "rgba(156,163,175,0.95)",
                            color: "white",
                            fontSize: 10,
                            padding: "2px 6px",
                            borderRadius: 6,
                          }}
                        >
                          {status}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{it.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {it.quantity} × Ksh {Number(it.price || 0).toLocaleString()}
                        </div>

                        <div className="text-[10px] text-muted-foreground mt-1">
                          <div>
                            <strong>resolved:</strong>{" "}
                            <a
                              href={it.image === PLACEHOLDER_DATA_URI ? undefined : it.image}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {String(it.image).slice(0, 80)}
                            </a>
                          </div>
                          {it._rawCandidate && (
                            <div>
                              <strong>raw:</strong>{" "}
                              {String(it._rawCandidate).slice(0, 60)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
