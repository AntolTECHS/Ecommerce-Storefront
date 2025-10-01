import { X, Plus, Minus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast.js";
import { useNavigate } from "react-router-dom";

/**
 * ShoppingCart
 *
 * Props:
 *  - isOpen: boolean
 *  - onClose: fn
 *  - items: array [{ _id|id, name, price, quantity, image, images }]
 *  - cartItems: array [...] (preferred)
 *  - onUpdateQuantity: fn(productId, newQuantity)
 *  - onRemoveItem: fn(productId)
 *  - isLoggedIn: boolean
 *  - navigate: fn (from react-router) optional, will fallback to useNavigate()
 *  - formatPrice: fn(value) optional - if provided, used to format currency
 */
export const ShoppingCart = ({
  isOpen,
  onClose,
  items = [],
  cartItems = undefined,
  onUpdateQuantity,
  onRemoveItem,
  isLoggedIn,
  navigate,
  formatPrice,
}) => {
  const { toast } = useToast();
  const routerNavigate = useNavigate();
  const nav = navigate || routerNavigate;

  const itemsToRender = Array.isArray(cartItems)
    ? cartItems
    : Array.isArray(items)
    ? items
    : [];

  // eslint-disable-next-line no-console
  console.debug("[ShoppingCart] rendering with items count:", itemsToRender.length);

  const rawApiBase =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    "http://localhost:5000";
  const API_BASE = String(rawApiBase)
    .replace(/^http:\/\//, "https://")
    .replace(/\/$/, "");

  const getImageUrl = (imgOrItem) => {
    if (!imgOrItem) return "/placeholder.png";
    if (typeof imgOrItem === "object" && !(typeof imgOrItem === "string")) {
      const item = imgOrItem;
      const cand =
        (Array.isArray(item.images) && item.images[0]) ||
        item.image ||
        item.thumbnail ||
        item.url ||
        item.path ||
        item.filename;
      if (!cand) return "/placeholder.png";
      return getImageUrl(cand);
    }
    if (typeof File !== "undefined" && imgOrItem instanceof File) {
      try {
        return URL.createObjectURL(imgOrItem);
      } catch {
        return "/placeholder.png";
      }
    }
    if (typeof imgOrItem === "string") {
      const str = imgOrItem;
      if (str.startsWith("http") || str.startsWith("//")) return str;
      if (str.startsWith("/")) return `${API_BASE}${str}`;
      return `${API_BASE}/${str.replace(/^\/+/, "")}`;
    }
    return "/placeholder.png";
  };

  const formatCurrency = (value) => {
    if (typeof formatPrice === "function") return formatPrice(value);
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

  const subtotal = itemsToRender.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (item.quantity || 0),
    0
  );
  const tax = subtotal * 0.1;
  const total = subtotal + tax;

  if (!isOpen) return null;

  const handleCheckout = () => {
    // ✅ safer: check both prop and localStorage
    const logged =
      typeof isLoggedIn === "boolean"
        ? isLoggedIn
        : Boolean(localStorage.getItem("token"));

    if (!logged) {
      toast?.({
        title: "Login required",
        description: "Please log in to complete checkout",
        variant: "destructive",
      });
      setTimeout(() => {
        nav?.("/login");
      }, 200);
      return;
    }

    nav?.("/checkout");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch"
      aria-hidden={isOpen ? "false" : "true"}
    >
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
      />

      <aside className="relative ml-auto w-full max-w-md lg:max-w-lg h-full bg-white shadow-2xl">
        <Card className="h-full rounded-none border-0 flex flex-col">
          <CardHeader className="flex items-center justify-between gap-4 px-5 py-4 border-b">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-indigo-50 p-2">
                <ShoppingBag className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  Shopping Cart
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {itemsToRender.length} item
                  {itemsToRender.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {itemsToRender.length}
              </Badge>

              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close cart"
                className="rounded-md"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex-1 p-4 overflow-auto">
            {itemsToRender.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <div className="p-6 rounded-full bg-gray-100">
                  <ShoppingBag className="h-12 w-12 text-gray-400" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold">Your cart is empty</h3>
                  <p className="text-sm text-muted-foreground">
                    Add some products to get started.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {itemsToRender.map((item) => {
                  const id =
                    item._id || item.id || item.sku || String(item._tempId || "");
                  const imgSrc = getImageUrl(item);

                  return (
                    <div
                      key={id}
                      className="flex gap-3 items-start bg-white p-3 rounded-lg border shadow-sm"
                    >
                      <div className="flex-shrink-0 w-20 h-20 rounded-md overflow-hidden bg-gray-50 border">
                        <img
                          src={imgSrc}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={(e) =>
                            (e.currentTarget.src = "/placeholder.png")
                          }
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium leading-tight line-clamp-2 break-words">
                          {item.name}
                        </h4>

                        <div className="mt-1 flex items-center justify-between gap-4">
                          <div className="text-sm text-muted-foreground">
                            {formatCurrency(item.price)}
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 bg-gray-50 border rounded-md px-1">
                              <button
                                aria-label={`Decrease quantity of ${item.name}`}
                                className="p-1 rounded-sm hover:bg-gray-100 disabled:opacity-50"
                                onClick={() =>
                                  item.quantity > 1
                                    ? onUpdateQuantity?.(id, item.quantity - 1)
                                    : onRemoveItem?.(id)
                                }
                                disabled={item.quantity <= 0}
                              >
                                <Minus className="h-4 w-4" />
                              </button>

                              <div className="text-sm w-8 text-center">
                                {item.quantity}
                              </div>

                              <button
                                aria-label={`Increase quantity of ${item.name}`}
                                className="p-1 rounded-sm hover:bg-gray-100"
                                onClick={() =>
                                  onUpdateQuantity?.(id, (item.quantity || 0) + 1)
                                }
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>

                            <button
                              className="text-sm text-destructive hover:underline"
                              onClick={() => onRemoveItem?.(id)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <Separator />
                <div className="text-sm space-y-2">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax (10%)</span>
                    <span>{formatCurrency(tax)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-base font-semibold">
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>

          <div className="p-4 border-t bg-white">
            {itemsToRender.length > 0 ? (
              <div className="space-y-3">
                <Button
                  className="w-full py-3 rounded-md bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-green-600"
                  size="lg"
                  onClick={handleCheckout}
                >
                  Proceed to Checkout
                </Button>

                <Button
                  variant="outline"
                  className="w-full py-3"
                  onClick={onClose}
                >
                  Continue Shopping
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button className="w-full py-3" onClick={onClose}>
                  Start Shopping
                </Button>
              </div>
            )}
          </div>
        </Card>
      </aside>
    </div>
  );
};

export default ShoppingCart;
