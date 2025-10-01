// src/pages/Index.jsx
// Search bar sticky, Reset button removed — X inside search clears the query
// Updated: supports VITE_API_URL or VITE_API_BASE_URL, upgrades http image URLs to https and guarantees API_BASE uses https when possible
// ✅ Now normalizes product.description in fetchProducts
// ✅ Truncates description for display (cards)

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

// ✅ fetch products (normalize description)
const fetchProducts = async () => {
  const res = await API.get("/products");
  const data = res.data;
  const products = Array.isArray(data) ? data : data?.products || [];
  return products.map((p) => ({
    ...p,
    description:
      p.description || p.details || p.desc || "No description provided.",
  }));
};

// ✅ truncate helper
const truncateDescription = (text, maxLength = 100) => {
  if (!text) return "";
  const clean = String(text).trim();
  return clean.length > maxLength ? clean.slice(0, maxLength) + "…" : clean;
};

const CART_KEY = "myapp_cart_v1";

const Index = () => {
  // --- state setup (same as before) ---
  const [cartItems, setCartItems] = useState(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() =>
    Boolean(localStorage.getItem("token"))
  );
  const { toast } = useToast();
  const navigate = useNavigate();
  const featuresRef = useRef(null);

  // keep login in sync
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "token") setIsLoggedIn(Boolean(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const [addingIds, setAddingIds] = useState(new Set());
  const [addedIds, setAddedIds] = useState(new Set());

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
    refetchInterval: 5000,
  });

  // --- categories ---
  const categories = useMemo(() => {
    const rawCats = products.map((p) => p.category || "uncategorized");
    const normalizedMap = new Map();
    rawCats.forEach((cat) => {
      const key = (cat || "").toLowerCase().trim();
      if (!normalizedMap.has(key)) normalizedMap.set(key, key);
    });
    return [
      { key: "all", label: "all" },
      ...Array.from(normalizedMap.entries()).map(([key, label]) => ({
        key,
        label,
      })),
    ];
  }, [products]);

  // --- search ---
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);
  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
  };

  const filteredProducts = useMemo(() => {
    const q = (searchQuery || "").toLowerCase();
    return products.filter((p) => {
      if (selectedCategory && selectedCategory !== "all") {
        if (((p.category || "") + "").toLowerCase().trim() !== selectedCategory)
          return false;
      }
      if (!q) return true;
      const name = (p.name || "").toLowerCase();
      const desc = (p.description || "").toLowerCase();
      const cat = (p.category || "").toLowerCase();
      return name.includes(q) || desc.includes(q) || cat.includes(q);
    });
  }, [products, selectedCategory, searchQuery]);

  useEffect(() => setShowAllProducts(false), [
    products,
    selectedCategory,
    searchQuery,
  ]);

  // --- persist cart ---
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cartItems));
    } catch {}
  }, [cartItems]);

  // --- backend base URL ---
  const rawApiBase =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    "http://localhost:5000";
  const API_BASE = String(rawApiBase)
    .replace(/^http:\/\//, "https://")
    .replace(/\/$/, "");

  // --- currency formatter ---
  const formatKSH = (value) => {
    const amount = Number(value) || 0;
    try {
      return new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: "KES",
      })
        .format(amount)
        .replace(/KES/g, "KSH");
    } catch {
      return `KSH ${amount.toFixed(2)}`;
    }
  };

  // --- image helper ---
  const getImageSrc = (productOrObj) => {
    const product = productOrObj || {};
    const img =
      product?.images?.[0] ||
      product?.image ||
      product?.thumbnail ||
      productOrObj;
    if (!img) return "/placeholder.png";
    if (typeof img === "string") {
      if (img.startsWith("http://"))
        return img.replace(/^http:\/\//, "https://");
      if (img.startsWith("https://") || img.startsWith("//")) return img;
      if (img.startsWith("/")) return `${API_BASE}${img}`;
      return `${API_BASE}/${img.replace(/^\/+/, "")}`;
    }
    if (typeof img === "object") {
      const url = img.url || img.path || img.filename;
      if (!url) return "/placeholder.png";
      if (url.startsWith("http://"))
        return url.replace(/^http:\/\//, "https://");
      if (url.startsWith("https://") || url.startsWith("//")) return url;
      if (url.startsWith("/")) return `${API_BASE}${url}`;
      return `${API_BASE}/${url.replace(/^\/+/, "")}`;
    }
    return "/placeholder.png";
  };

  // (modal + cart handlers remain unchanged, skipping here for brevity)

  if (isLoading)
    return (
      <p className="text-center mt-12 text-gray-500">Loading products...</p>
    );

  const VISIBLE_LIMIT = 8;
  const visibleProducts = showAllProducts
    ? filteredProducts
    : filteredProducts.slice(0, VISIBLE_LIMIT);

  return (
    <div className="min-h-screen bg-background">
      <Header
        cartItemsCount={cartItems.reduce(
          (sum, item) => sum + (item.quantity || 0),
          0
        )}
        onCartClick={() => setIsCartOpen(true)}
        isLoggedIn={isLoggedIn}
      />

      {/* Sticky search bar */}
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
            {searchInput && (
              <button
                onClick={clearSearch}
                aria-label="Clear search"
                className="ml-2 rounded p-1 hover:bg-gray-100"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            )}
          </div>
          <div className="ml-auto" />
        </div>
      </div>

      <main>
        <HeroSection />

        <section className="py-16 px-4">
          <div className="container mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Featured Products
              </h2>
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
              {visibleProducts.map((product) => (
                <article
                  key={product._id}
                  className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col hover:shadow-2xl transform hover:-translate-y-1 transition p-0 h-full min-w-0"
                >
                  <div
                    className="relative bg-gray-50 flex-shrink-0 flex items-center justify-center p-3 sm:p-4"
                    style={{ minHeight: 140 }}
                  >
                    <img
                      src={getImageSrc(product)}
                      alt={product.name}
                      className="max-h-full max-w-full object-contain"
                      onError={(e) =>
                        (e.currentTarget.src = "/placeholder.png")
                      }
                    />
                    <div className="absolute top-3 left-3">
                      <Badge className="uppercase text-[10px] px-2 py-0.5">
                        {(product.category || "uncategorized").toLowerCase()}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-3 sm:p-4 flex-1 min-h-0 flex flex-col">
                    <h3 className="text-base sm:text-lg font-semibold mb-1 truncate">
                      {product.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-600 mb-3 line-clamp-2">
                      {truncateDescription(product.description, 100)}
                    </p>
                    <div className="text-xs text-gray-500 mb-2">
                      Stock:{" "}
                      <span className="font-normal text-xs">
                        {product.stock ?? 0}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatKSH(product.price)}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <ShoppingCart
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={(id, qty) =>
          setCartItems((prev) =>
            prev.map((item) =>
              item._id === id ? { ...item, quantity: qty } : item
            )
          )
        }
        onRemoveItem={(id) =>
          setCartItems((prev) => prev.filter((item) => item._id !== id))
        }
        isLoggedIn={isLoggedIn}
        navigate={navigate}
      />
    </div>
  );
};

export default Index;
