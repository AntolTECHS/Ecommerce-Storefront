// src/pages/Index.jsx
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

// ✅ fetch products (handles both array and { products: [] })
const fetchProducts = async () => {
  const res = await API.get("/products");
  const data = res.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.products)) return data.products;
  return [];
};

const CART_KEY = "myapp_cart_v1"; // localStorage key for cart (versioned)

const Index = () => {
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
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() =>
    Boolean(localStorage.getItem("token"))
  );

  const { toast } = useToast();
  const navigate = useNavigate();
  const featuresRef = useRef(null);

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
    select: (data) =>
      Array.isArray(data) ? data : data?.products || [], // ✅ always array
    refetchInterval: 5000,
  });

  const categories = useMemo(() => {
    const rawCats = products.map((p) => p.category || "uncategorized");
    const normalizedMap = new Map();
    rawCats.forEach((cat) => {
      const key = (cat || "").toLowerCase().trim();
      if (!normalizedMap.has(key)) {
        const label = key;
        normalizedMap.set(key, label);
      }
    });
    return [
      { key: "all", label: "all" },
      ...Array.from(normalizedMap.entries()).map(([key, label]) => ({
        key,
        label,
      })),
    ];
  }, [products]);

  // SEARCH
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchDebounceMs = 300;

  useEffect(() => {
    const id = setTimeout(
      () => setSearchQuery(searchInput.trim()),
      searchDebounceMs
    );
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
      const name = (p.name || "").toString().toLowerCase();
      const desc = (p.description || "").toString().toLowerCase();
      const cat = (p.category || "").toString().toLowerCase();
      return name.includes(q) || desc.includes(q) || cat.includes(q);
    });
  }, [products, selectedCategory, searchQuery]);

  useEffect(() => {
    setShowAllProducts(false);
  }, [products, selectedCategory, searchQuery]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cartItems));
    } catch (e) {
      console.warn("Failed to save cart:", e);
    }
  }, [cartItems]);

  const rawApiBase =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    "http://localhost:5000";
  const API_BASE = String(rawApiBase)
    .replace(/^http:\/\//, "https://")
    .replace(/\/$/, "");

  const formatKSH = (value) => {
    const amount = Number(value) || 0;
    try {
      const formatted = new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: "KES",
      }).format(amount);
      return formatted.replace(/KES/g, "KSH");
    } catch {
      return `KSH ${amount.toFixed(2)}`;
    }
  };

  const getImageSrc = (productOrObj) => {
    const product = productOrObj || {};
    const img =
      product?.images?.[0] || product?.image || product?.thumbnail || productOrObj;
    if (!img) return "/placeholder.png";

    if (typeof img === "string") {
      if (img.startsWith("http://")) return img.replace(/^http:\/\//, "https://");
      if (img.startsWith("https://") || img.startsWith("//")) return img;
      if (img.startsWith("/")) return `${API_BASE}${img}`;
      return `${API_BASE}/${img.replace(/^\/+/, "")}`;
    }

    if (typeof img === "object") {
      const url = img.url || img.path || img.filename;
      if (!url) return "/placeholder.png";
      if (url.startsWith("http://")) return url.replace(/^http:\/\//, "https://");
      if (url.startsWith("https://") || url.startsWith("//")) return url;
      if (url.startsWith("/")) return `${API_BASE}${url}`;
      return `${API_BASE}/${String(url).replace(/^\/+/, "")}`;
    }
    return "/placeholder.png";
  };

  // Modal state
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

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setImageModalOpen(false);
    };
    if (imageModalOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [imageModalOpen]);

  // Cart actions
  const handleAddToCart = (product) => {
    const id = product._id;
    if (addingIds.has(id)) return;
    setAddingIds((prev) => new Set(prev).add(id));

    setCartItems((prev) => {
      const existingItem = prev.find((item) => item._id === product._id);
      if (existingItem) {
        const updated = prev.map((item) =>
          item._id === product._id
            ? { ...item, quantity: (item.quantity || 0) + 1 }
            : item
        );
        setAddingIds((prev) => {
          const s = new Set(prev);
          s.delete(id);
          return s;
        });
        setAddedIds((prev) => new Set(prev).add(id));
        setTimeout(() => {
          setAddedIds((prev) => {
            const s = new Set(prev);
            s.delete(id);
            return s;
          });
        }, 1400);
        toast({
          title: "Cart Updated",
          description: `${product.name} quantity increased`,
        });
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
        setTimeout(() => {
          setAddedIds((prev) => {
            const s = new Set(prev);
            s.delete(id);
            return s;
          });
        }, 1400);
        toast({
          title: "Added to Cart",
          description: `${product.name} added to cart`,
        });
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

  const totalCartItems = cartItems.reduce(
    (sum, item) => sum + (item.quantity || 0),
    0
  );

  // Auto-scroll Features
  useEffect(() => {
    if (!featuresRef.current) return;
    const container = featuresRef.current;
    let scrollAmount = 0;
    const interval = setInterval(() => {
      if (!container.children.length) return;
      const slideWidth = container.children[0].offsetWidth + 24;
      scrollAmount += slideWidth;
      if (scrollAmount > container.scrollWidth - container.clientWidth)
        scrollAmount = 0;
      container.scrollTo({ left: scrollAmount, behavior: "smooth" });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading)
    return <p className="text-center mt-12 text-gray-500">Loading products...</p>;

  const ActionButtons = ({ product, vertical = false, className = "" }) => {
    const id = product._id;
    const isAdding = addingIds.has(id);
    const isAdded = addedIds.has(id);

    if (vertical) {
      return (
        <div className={`${className} flex flex-col items-end gap-2`}>
          <Button
            size="sm"
            onClick={() => handleViewImage(product)}
            className="bg-green-500 hover:bg-green-600 text-white px-2 py-1 text-sm rounded-md"
          >
            View
          </Button>
          <Button
            size="sm"
            onClick={() => handleAddToCart(product)}
            disabled={product.stock <= 0 || isAdding}
            className={`px-2 py-2 text-sm font-semibold text-white shadow-md rounded-md transform hover:-translate-y-0.5 ${
              product.stock <= 0
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-indigo-600 hover:to-blue-600"
            }`}
          >
            {isAdding ? "Adding..." : isAdded ? "Added ✓" : "Add to Cart"}
          </Button>
        </div>
      );
    }
    return (
      <div className={`${className} flex items-center gap-2 w-full min-w-0`}>
        <Button
          size="sm"
          onClick={() => handleViewImage(product)}
          className="w-14 bg-green-500 hover:bg-green-600 text-white rounded-md px-2 py-1 text-xs"
        >
          View
        </Button>
        <Button
          size="sm"
          onClick={() => handleAddToCart(product)}
          disabled={product.stock <= 0 || isAdding}
          className={`flex-1 px-2 py-2 text-xs font-medium text-white shadow-md rounded-md truncate ${
            product.stock <= 0
              ? "bg-gray-300 text-gray-600 cursor-not-allowed"
              : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-indigo-600 hover:to-blue-600"
          }`}
        >
          {isAdding ? "Adding..." : isAdded ? "Added ✓" : "Add to Cart"}
        </Button>
      </div>
    );
  };

  const VISIBLE_LIMIT = 8;
  const visibleProducts = showAllProducts
    ? filteredProducts
    : filteredProducts.slice(0, VISIBLE_LIMIT);

  return (
    <div className="min-h-screen bg-background">
      <Header
        cartItemsCount={totalCartItems}
        onCartClick={() => setIsCartOpen(true)}
        isLoggedIn={isLoggedIn}
      />
      {/* Sticky search bar */}
      <div className="sticky top-16 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center gap-3">
          <div className="flex items-center w-full sm:max-w-xl bg-gray-50 rounded-lg px-3 py-2 shadow-sm">
            <Search className="h-4 w-4 text-gray-400 mr-2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search products..."
              className="w-full bg-transparent outline-none text-sm"
            />
            {searchInput ? (
              <button onClick={clearSearch} className="ml-2 rounded p-1 hover:bg-gray-100">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            ) : null}
          </div>
          <div className="ml-auto" />
        </div>
      </div>

      <main>
        <HeroSection />
        <section className="py-16 px-4">
          <div className="container mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Featured Products</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Discover our handpicked selection of premium tech products
              </p>
            </div>
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {visibleProducts.map((product) => (
                <article
                  key={product._id}
                  className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col hover:shadow-2xl transform hover:-translate-y-1 transition"
                >
                  <div className="relative bg-gray-50 flex items-center justify-center p-4" style={{ minHeight: 140 }}>
                    <div className="w-full h-full bg-white rounded-lg flex items-center justify-center overflow-hidden p-3">
                      <img
                        src={getImageSrc(product)}
                        alt={product.name}
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => (e.currentTarget.src = "/placeholder.png")}
                      />
                    </div>
                    <div className="absolute top-3 left-3">
                      <Badge className="uppercase text-[10px] px-2 py-0.5">
                        {(product.category || "uncategorized").toLowerCase()}
                      </Badge>
                    </div>
                    {product.stock <= 0 && (
                      <div className="absolute top-3 right-3 bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded">
                        Out of stock
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex flex-col lg:flex-row lg:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-base sm:text-lg font-semibold mb-1 truncate">{product.name}</h3>
                        <p className="text-xs text-gray-600 mb-3 line-clamp-2">
                          {product.description || "No description provided."}
                        </p>
                        <div className="text-xs text-gray-500 mb-2">
                          Stock: {product.stock ?? 0}
                        </div>
                        <div className="text-sm font-medium text-gray-900">
                          {formatKSH(product.price)}
                        </div>
                      </div>
                      <div className="hidden lg:flex lg:flex-col items-end gap-2 ml-4">
                        <ActionButtons product={product} vertical />
                      </div>
                    </div>
                    <div className="mt-3 lg:hidden">
                      <ActionButtons product={product} />
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {filteredProducts.length > VISIBLE_LIMIT && !showAllProducts && (
              <div className="text-center mt-8">
                <Button
                  variant="outline"
                  onClick={() => setShowAllProducts(true)}
                  className="rounded-full px-6"
                >
                  Show More
                </Button>
              </div>
            )}
            {filteredProducts.length === 0 && (
              <p className="text-center text-gray-500 mt-8">No products found.</p>
            )}
          </div>
        </section>
      </main>
      <ShoppingCart
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        formatPrice={formatKSH}
      />
      {imageModalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center z-50 p-4"
          onClick={() => setImageModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg p-2 max-w-3xl w-full relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold">Product Image</h2>
              <button
                onClick={() => setImageModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex justify-center items-center">
              <img
                src={modalImage || "/placeholder.png"}
                alt="Product"
                className={`object-contain transition-all ${
                  modalExpanded ? "max-h-[80vh]" : "max-h-96"
                }`}
                onClick={() => setModalExpanded(!modalExpanded)}
              />
            </div>
            {modalImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto mt-4 pb-2">
                {modalImages.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`Thumbnail ${i + 1}`}
                    className={`h-20 w-20 object-cover cursor-pointer rounded border ${
                      src === modalImage ? "border-blue-500" : "border-gray-300"
                    }`}
                    onClick={() => setModalImage(src)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
