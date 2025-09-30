// src/pages/Index.jsx (search bar sticky, Reset button removed — X inside search clears the query)
// Updated: supports VITE_API_URL or VITE_API_BASE_URL, upgrades http image URLs to https and guarantees API_BASE uses https when possible
import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header.jsx";
import { HeroSection } from "@/components/HeroSection.jsx";
import { ShoppingCart } from "@/components/ShoppingCart.jsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter, Search, X } from "lucide-react";
import API from "@/services/api";
import { useToast } from "@/hooks/use-toast.js";

// ✅ fetch products (public)
const fetchProducts = async () => {
  const res = await API.get("/products"); // was /admin/products
  return res.data;
};

const CART_KEY = "myapp_cart_v1"; // localStorage key for cart (versioned)

const Index = () => {
  // initialize cart from localStorage so it persists across refresh/navigation
  const [cartItems, setCartItems] = useState(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn("Failed to read cart from localStorage:", e);
      return [];
    }
  });

  const [isCartOpen, setIsCartOpen] = useState(false);
  // NOTE: selectedCategory uses normalized keys (lowercase). default is "all"
  const [selectedCategory, setSelectedCategory] = useState("all");
  // derive logged-in state from localStorage token so it reflects real auth state
  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(localStorage.getItem("token")));
  const { toast } = useToast();
  const navigate = useNavigate();
  const featuresRef = useRef(null);

  // keep isLoggedIn in sync across tabs
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "token") setIsLoggedIn(Boolean(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // UI feedback for add-to-cart
  const [addingIds, setAddingIds] = useState(new Set()); // productIds currently being added
  const [addedIds, setAddedIds] = useState(new Set()); // productIds recently added (show "Added" briefly)

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
    refetchInterval: 5000, // auto-refresh every 5s for new products
  });

  // ---------------------------
  // Normalized categories (case-insensitive, deduplicated)
  // returns array of { key, label } where key is lowercase trimmed category and label is a nice display name
  // ---------------------------
  const categories = useMemo(() => {
    // gather raw categories preserving the order they appear in products
    const rawCats = products.map((p) => p.category || "Uncategorized");

    const normalizedMap = new Map();
    rawCats.forEach((cat) => {
      const key = (cat || "").toLowerCase().trim();
      if (!normalizedMap.has(key)) {
        // create a display label by capitalizing words
        const label = key.replace(/\b\w/g, (c) => c.toUpperCase());
        normalizedMap.set(key, label);
      }
    });

    // include "All" at the front with key "all"
    return [{ key: "all", label: "All" }, ...Array.from(normalizedMap.entries()).map(([key, label]) => ({ key, label }))];
  }, [products]);

  // ---------- SEARCH ----------
  // controlled input (instant) + debounced query for filtering
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchDebounceMs = 300;

  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput.trim()), searchDebounceMs);
    return () => clearTimeout(id);
  }, [searchInput]);

  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
  };
  // ---------- end SEARCH ----------

  const filteredProducts = useMemo(() => {
    const q = (searchQuery || "").toLowerCase();
    return products.filter((p) => {
      // category filter (case-insensitive)
      if (selectedCategory && selectedCategory !== "all") {
        if (((p.category || "") + "").toLowerCase().trim() !== selectedCategory) return false;
      }

      // search filter: check name, description, category
      if (!q) return true;
      const name = (p.name || "").toString().toLowerCase();
      const desc = (p.description || "").toString().toLowerCase();
      const cat = (p.category || "").toString().toLowerCase();
      return name.includes(q) || desc.includes(q) || cat.includes(q);
    });
  }, [products, selectedCategory, searchQuery]);

  // Auto-save cart to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cartItems));
    } catch (e) {
      console.warn("Failed to save cart to localStorage:", e);
    }
  }, [cartItems]);

  // Backend base URL (for images returned as relative paths)
  // Prefer VITE_API_URL, fall back to VITE_API_BASE_URL, then localhost.
  // Ensure we upgrade http: -> https: to avoid mixed-content.
  const rawApiBase =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    "http://localhost:5000";
  const API_BASE = String(rawApiBase).replace(/^http:\/\//, "https://").replace(/\/$/, "");

  // Currency formatter for Kenyan shillings
  const formatKES = (value) => {
    const amount = Number(value) || 0;
    return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(amount);
  };

  // helper to produce a usable image src from many backend shapes
  const getImageSrc = (productOrObj) => {
    const product = productOrObj || {};
    const img = product?.images?.[0] || product?.image || product?.thumbnail || productOrObj;
    if (!img) return "/placeholder.png";

    if (typeof img === "string") {
      // upgrade insecure http URLs to https to avoid mixed-content errors
      if (img.startsWith("http://")) return img.replace(/^http:\/\//, "https://");
      if (img.startsWith("https://") || img.startsWith("//")) return img;
      if (img.startsWith("/")) return `${API_BASE}${img}`;
      return `${API_BASE}/${img.replace(/^\/+/, "")}`;
    }

    if (typeof img === "object") {
      const url = img.url || img.path || img.filename;
      if (!url) return "/placeholder.png";
      if (typeof url === "string") {
        if (url.startsWith("http://")) return url.replace(/^http:\/\//, "https://");
        if (url.startsWith("https://") || url.startsWith("//")) return url;
        if (url.startsWith("/")) return `${API_BASE}${url}`;
        return `${API_BASE}/${String(url).replace(/^\/+/, "")}`;
      }
    }

    return "/placeholder.png";
  };

  // Image modal state + handler — clicking "View" opens a preview modal with thumbnails
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [modalImage, setModalImage] = useState(null);
  const [modalImages, setModalImages] = useState([]);
  const [modalExpanded, setModalExpanded] = useState(false);

  const handleViewImage = (product) => {
    const imgs =
      Array.isArray(product?.images) && product.images.length
        ? product.images
        : product?.image
        ? [product.image]
        : product?.thumbnail
        ? [product.thumbnail]
        : [product];

    const srcs = imgs.map((img) => getImageSrc({ images: [img] }));
    setModalImages(srcs);
    setModalImage(srcs[0] ?? "/placeholder.png");
    setModalExpanded(false);
    setImageModalOpen(true);
  };

  // close modal on Esc
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setImageModalOpen(false);
    };
    if (imageModalOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [imageModalOpen]);

  // Add to cart (with feedback)
  const handleAddToCart = (product) => {
    const id = product._id;
    if (addingIds.has(id)) return;

    setAddingIds((prev) => new Set(prev).add(id));

    setCartItems((prev) => {
      const existingItem = prev.find((item) => item._id === product._id);
      if (existingItem) {
        const updated = prev.map((item) =>
          item._id === product._id ? { ...item, quantity: (item.quantity || 0) + 1 } : item
        );

        setAddingIds((prev) => {
          const s = new Set(prev);
          s.delete(id);
          return s;
        });
        setAddedIds((prev) => new Set(prev).add(id));
        setTimeout(() =>
          setAddedIds((prev) => {
            const s = new Set(prev);
            s.delete(id);
            return s;
          }),
          1400
        );

        toast({ title: "Cart Updated", description: `${product.name} quantity increased` });

        return updated;
      } else {
        const normalizedImage = getImageSrc(product);
        const newItem = { ...product, quantity: 1, image: normalizedImage };

        setAddingIds((prev) => {
          const s = new Set(prev);
          s.delete(id);
          return s;
        });
        setAddedIds((prev) => new Set(prev).add(id));
        setTimeout(() =>
          setAddedIds((prev) => {
            const s = new Set(prev);
            s.delete(id);
            return s;
          }),
          1400
        );

        toast({ title: "Added to Cart", description: `${product.name} added to cart` });

        return [...prev, newItem];
      }
    });
  };

  const handleUpdateQuantity = (productId, quantity) => {
    setCartItems((prev) =>
      prev.map((item) => (item._id === productId ? { ...item, quantity } : item))
    );
  };

  const handleRemoveItem = (productId) => {
    setCartItems((prev) => prev.filter((item) => item._id !== productId));
    toast({
      title: "Item Removed",
      description: "Item has been removed from your cart",
      variant: "destructive",
    });
  };

  const handleProductClick = (product) => {
    navigate(`/product/${product._id}`);
  };

  const totalCartItems = cartItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

  // Auto-scroll for Features Section
  useEffect(() => {
    if (!featuresRef.current) return;
    const container = featuresRef.current;
    let scrollAmount = 0;

    const interval = setInterval(() => {
      if (!container.children.length) return;
      const slideWidth = container.children[0].offsetWidth + 24; // gap-6 = 24px
      scrollAmount += slideWidth;
      if (scrollAmount > container.scrollWidth - container.clientWidth) scrollAmount = 0;
      container.scrollTo({ left: scrollAmount, behavior: "smooth" });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  if (isLoading) return <p className="text-center mt-12 text-gray-500">Loading products...</p>;

  // Small component to keep buttons consistent
  const ActionButtons = ({ product, vertical = false, className = "" }) => {
    const id = product._id;
    const isAdding = addingIds.has(id);
    const isAdded = addedIds.has(id);

    if (vertical) {
      return (
        <div className={`${className} flex flex-col items-end gap-2`}>
          <Button
            type="button"
            size="sm"
            onClick={() => handleViewImage(product)}
            className="bg-green-500 hover:bg-green-600 text-white px-2 py-1 text-sm rounded-md"
          >
            View
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => handleAddToCart(product)}
            disabled={product.stock <= 0 || isAdding}
            className={`px-2 py-2 text-sm font-semibold text-white shadow-md rounded-md transform hover:-translate-y-0.5 ${
              product.stock <= 0 ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-indigo-600 hover:to-blue-600"
            }`}
          >
            {isAdding ? "Adding..." : isAdded ? "Added ✓" : "Add to Cart"}
          </Button>
        </div>
      );
    }

    return (
      <div className={`${className} flex items-center gap-2 w-full min-w-0 overflow-hidden`}>
        <Button
          type="button"
          size="sm"
          onClick={() => handleViewImage(product)}
          className="w-14 flex-shrink-0 bg-green-500 hover:bg-green-600 text-white rounded-md px-2 py-1 text-xs"
        >
          View
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={() => handleAddToCart(product)}
          disabled={product.stock <= 0 || isAdding}
          className={`flex-1 min-w-0 px-2 py-2 text-xs font-medium text-white shadow-md rounded-md truncate ${
            product.stock <= 0 ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-indigo-600 hover:to-blue-600"
          }`}
        >
          {isAdding ? "Adding..." : isAdded ? "Added ✓" : "Add to Cart"}
        </Button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header
        cartItemsCount={totalCartItems}
        onCartClick={() => setIsCartOpen(true)}
        isLoggedIn={isLoggedIn}
      />

      {/* STICKY SEARCH BAR — placed JUST below header and stays visible */}
      <div className="sticky top-16 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center gap-3">
          <div className="flex items-center w-full sm:max-w-xl bg-gray-50 rounded-lg px-3 py-2 shadow-sm">
            <Search className="h-4 w-4 text-gray-400 mr-2" />
            <input
              aria-label="Search products"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search products by name, description or category..."
              className="w-full bg-transparent outline-none text-sm"
            />
            {searchInput ? (
              <button
                onClick={clearSearch}
                aria-label="Clear search"
                className="ml-2 rounded p-1 hover:bg-gray-100"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            ) : null}
          </div>

          {/* removed matches counter (intentionally left blank to preserve layout) */}
            <div className="ml-auto" />
        </div>
      </div>

      <main>
        <HeroSection />

        {/* Product Catalog */}
        <section className="py-16 px-4">
          <div className="container mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Featured Products</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Discover our handpicked selection of premium tech products
              </p>
            </div>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2 justify-center mb-8">
              <div className="flex items-center gap-2 mr-4">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filter:</span>
              </div>
              {categories.map((cat) => (
                <Button
                  key={cat.key}
                  variant={selectedCategory === cat.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(cat.key)}
                  className="rounded-full"
                >
                  {cat.label}
                </Button>
              ))}
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredProducts.map((product) => (
                <article
                  key={product._id}
                  className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col hover:shadow-2xl transform hover:-translate-y-1 transition p-0 h-full min-w-0"
                >
                  {/* IMAGE */}
                  <div className="relative bg-gray-50 flex-shrink-0 flex items-center justify-center p-3 sm:p-4" style={{ minHeight: 140 }}>
                    <div className="w-full h-full bg-white rounded-lg flex items-center justify-center overflow-hidden p-3">
                      <img
                        src={getImageSrc(product)}
                        alt={product.name}
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => (e.currentTarget.src = "/placeholder.png")}
                      />
                    </div>

                    {Array.isArray(product.images) && product.images.length > 1 && (
                      <div className="absolute left-1/2 transform -translate-x-1/2 bottom-2 md:hidden flex gap-2">
                        {product.images.slice(0, 2).map((img, idx) => (
                          <div key={idx} className="w-12 h-12 bg-white rounded overflow-hidden border">
                            <img
                              src={getImageSrc({ images: [img] })}
                              alt={`${product.name}-thumb-${idx}`}
                              className="w-full h-full object-cover"
                              onError={(e) => (e.currentTarget.src = "/placeholder.png")}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Make category text smaller */}
                    <div className="absolute top-3 left-3">
                      <Badge className="uppercase text-[10px] px-2 py-0.5">{product.category || "Uncategorized"}</Badge>
                    </div>
                    {product.stock <= 0 && (
                      <div className="absolute top-3 right-3 bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded">Out of stock</div>
                    )}
                  </div>

                  {/* CONTENT + ACTIONS (responsive) */}
                  <div className="p-3 sm:p-4 flex-1 min-h-0 flex flex-col">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-base sm:text-lg font-semibold mb-1 truncate">{product.name}</h3>

                        <p
                          className="text-xs sm:text-sm text-gray-600 mb-3"
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {product.description || "No description provided."}
                        </p>

                        {/* Make stock text smaller */}
                        <div className="text-xs text-gray-500 mb-2">
                          Stock: <span className="font-normal text-xs">{product.stock ?? 0}</span>
                        </div>

                        {/* Make product price smaller and less bold */}
                        <div className="text-lg font-medium text-gray-900">{formatKES(product.price)}</div>
                      </div>

                      {/* Right: actions for large screens */}
                      <div className="hidden lg:flex lg:flex-col lg:items-end lg:justify-start gap-2 lg:ml-4">
                        <ActionButtons product={product} vertical />
                      </div>
                    </div>
                  </div>

                  {/* ACTION FOOTER - visible only on small screens */}
                  <div className="px-3 sm:px-4 pb-4 pt-2 bg-white border-t border-gray-100 flex gap-2 lg:hidden">
                    <div className="flex w-full justify-between items-center min-w-0">
                      <div className="flex-1 mr-2 min-w-0">
                        <ActionButtons product={product} />
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="text-center mt-12">
              <Button variant="outline" size="lg">View All Products</Button>
            </div>
          </div>
        </section>
      </main>

      {/* Image preview modal */}
      {imageModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setImageModalOpen(false);
          }}
        >
          <div className="max-w-3xl w-full relative">
            <button
              onClick={() => setImageModalOpen(false)}
              aria-label="Close preview"
              className="absolute top-2 right-2 z-10 rounded-full bg-white/90 hover:bg-white px-3 py-1 shadow"
            >
              ✕
            </button>

            <div
              className="bg-white rounded-lg overflow-hidden p-4 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-center">
                <img
                  src={modalImage}
                  alt="Selected preview"
                  className={modalExpanded ? "w-full max-h-[80vh] object-contain" : "h-28 md:h-36 object-contain cursor-pointer"}
                  onClick={() => setModalExpanded((v) => !v)}
                  onError={(e) => (e.currentTarget.src = "/placeholder.png")}
                />
              </div>

              <div className="flex gap-3 overflow-x-auto pb-2">
                {modalImages.length ? (
                  modalImages.map((src, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setModalImage(src);
                        setModalExpanded(true);
                      }}
                      className={`flex-shrink-0 rounded border p-0.5 ${modalImage === src ? "ring-2 ring-indigo-400" : ""}`}
                      aria-label={`View image ${idx + 1}`}
                      style={{ background: "white" }}
                    >
                      <img
                        src={src}
                        alt={`thumb-${idx}`}
                        className="h-16 w-auto object-cover block"
                        onError={(e) => (e.currentTarget.src = "/placeholder.png")}
                      />
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No images available.</p>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setModalExpanded((v) => !v)}
                  className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm"
                >
                  {modalExpanded ? "Shrink" : "Expand"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shopping Cart */}
      <ShoppingCart
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        isLoggedIn={isLoggedIn}
        navigate={navigate}
      />
    </div>
  );
};

export default Index;
