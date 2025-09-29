import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "@/services/api";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast.js";

const CART_KEY = "myapp_cart_v1"; // must match Index.jsx localStorage key

export default function Checkout() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // load cart from localStorage
  const [cartItems, setCartItems] = useState(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn("Failed to parse cart from localStorage", e);
      return [];
    }
  });

  // form state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Kenya");
  const [paymentMethod, setPaymentMethod] = useState("cod"); // cod or card

  const [isPlacing, setIsPlacing] = useState(false);

  // compute totals
  const subtotal = useMemo(
    () =>
      cartItems.reduce(
        (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0),
        0
      ),
    [cartItems]
  );
  const tax = useMemo(() => +(subtotal * 0.1), [subtotal]);
  const total = useMemo(() => +(subtotal + tax), [subtotal, tax]);

  const formatKES = (value) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(
      Number(value) || 0
    );

  useEffect(() => {
    // if cart changed in other tab, update local state
    const onStorage = (e) => {
      if (e.key === CART_KEY) {
        try {
          const parsed = JSON.parse(e.newValue || "[]");
          setCartItems(Array.isArray(parsed) ? parsed : []);
        } catch {
          setCartItems([]);
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const validateForm = () => {
    if (!cartItems || cartItems.length === 0) {
      toast?.({ title: "Cart is empty", description: "Add items to your cart before placing an order", variant: "destructive" });
      return false;
    }
    if (!fullName.trim()) {
      toast?.({ title: "Missing name", description: "Please enter your full name", variant: "destructive" });
      return false;
    }
    if (!phone.trim()) {
      toast?.({ title: "Missing phone", description: "Please enter a phone number", variant: "destructive" });
      return false;
    }
    if (!address.trim()) {
      toast?.({ title: "Missing address", description: "Please enter a delivery address", variant: "destructive" });
      return false;
    }
    return true;
  };

  // ----------------------------
  // CHANGED: Robust place order handler (canonical shape)
  // ----------------------------
  const handlePlaceOrder = async () => {
    if (!validateForm()) return;

    console.debug("Cart before placing order:", cartItems);

    if (!cartItems || cartItems.length === 0) {
      toast?.({ title: "Cart empty", description: "Add items before placing order", variant: "destructive" });
      return;
    }

    const token = localStorage.getItem("token");
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    // canonical orderItems shape expected by most MERN backends
    const orderItems = cartItems.map((it) => ({
      name: it.name,
      qty: Number(it.quantity || it.qty || 1),
      price: Number(it.price || it.unitPrice || 0),
      product: it._id || it.id || it.productId || it.product,
    }));

    const payload = {
      orderItems,
      shippingAddress: {
        address: address || "",
        city: city || "",
        postalCode: postalCode || "",
        country: country || "",
        fullName: fullName || "",
        phone: phone || "",
        email: email || "",
      },
      paymentMethod,
      itemsPrice: +subtotal.toFixed(2),
      taxPrice: +tax.toFixed(2),
      total: +total.toFixed(2),
    };

    console.debug("Placing order — payload:", payload);

    setIsPlacing(true);

    try {
      const res = await API.post("/orders", payload, { headers });
      console.debug("Order success response:", res?.data);

      toast?.({ title: "Order placed", description: "Thanks! Your order was placed successfully." });

      localStorage.removeItem(CART_KEY);
      setCartItems([]);

      const orderId = res?.data?._id || res?.data?.id;
      if (orderId) navigate(`/order/${orderId}`);
      else navigate("/orders");
    } catch (err) {
      const respData = err?.response?.data;
      console.error("Place order error — response data:", respData, err);

      const serverMessage = respData?.message || respData?.error || (typeof respData === "string" ? respData : JSON.stringify(respData || {}));
      toast?.({ title: `Order failed (${err?.response?.status || "?"})`, description: serverMessage, variant: "destructive" });

      // still helpful to log raw request in case server received something different
      try {
        console.debug("Request body sent (stringified):", JSON.stringify(payload));
      } catch (e) {}
    } finally {
      setIsPlacing(false);
    }
  };
  // ----------------------------
  // End CHANGED
  // ----------------------------

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LEFT: Shipping form */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow p-6">
          <div className="bg-indigo-600 text-white px-5 py-4 rounded-lg mb-6">
            <h3 className="font-semibold">Shipping details</h3>
            <p className="text-sm opacity-90">Enter where we should deliver your order</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full mt-1 p-3 border rounded-md" placeholder="John Doe" />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full mt-1 p-3 border rounded-md" placeholder="name@example.com" />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full mt-1 p-3 border rounded-md" placeholder="+254 7xx xxx xxx" />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Postal code</label>
              <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="w-full mt-1 p-3 border rounded-md" placeholder="00100" />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-medium text-gray-700">Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full mt-1 p-3 border rounded-md" placeholder="Street, building, apartment, etc." />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full mt-1 p-3 border rounded-md" placeholder="Nairobi" />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Country</label>
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="w-full mt-1 p-3 border rounded-md">
                <option>Kenya</option>
                <option>Uganda</option>
                <option>Tanzania</option>
                <option>United States</option>
                <option>United Kingdom</option>
              </select>
            </div>
          </div>

          <div className="mt-6 p-4 border rounded-md">
            <h4 className="font-medium mb-3">Payment method</h4>
            <div className="flex gap-4">
              <label className={`flex-1 p-3 border rounded-md ${paymentMethod === "cod" ? "bg-green-50 border-green-200" : ""}`}>
                <input type="radio" name="pm" checked={paymentMethod === "cod"} onChange={() => setPaymentMethod("cod")} className="mr-2" />
                <span className="font-medium">Cash on Delivery</span>
                <div className="text-sm text-muted-foreground">Pay when your order arrives</div>
              </label>

              <label className={`flex-1 p-3 border rounded-md ${paymentMethod === "card" ? "bg-blue-50 border-blue-200" : ""}`}>
                <input type="radio" name="pm" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} className="mr-2" />
                <span className="font-medium">Card payment</span>
                <div className="text-sm text-muted-foreground">You will pay on the next screen</div>
              </label>
            </div>
          </div>
        </div>

        {/* RIGHT: Order summary */}
        <aside className="bg-white rounded-2xl shadow p-6 h-fit">
          <h3 className="text-lg font-semibold">Order summary</h3>
          <p className="text-sm text-muted-foreground mb-4">{cartItems.length} item{cartItems.length !== 1 ? "s" : ""}</p>

          <div className="space-y-3 max-h-64 overflow-auto pb-2">
            {cartItems.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No items in your cart.</div>
            ) : (
              cartItems.map((it) => (
                <div key={it._id || it.id} className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-md overflow-hidden bg-gray-50 border">
                    <img src={
                      it.image || it.thumbnail || it.images?.[0] || "/placeholder.png"
                    } alt={it.name} className="w-full h-full object-cover" onError={(e)=>e.currentTarget.src="/placeholder.png"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{it.name}</div>
                    <div className="text-xs text-muted-foreground">{it.quantity} × {formatKES(it.price)}</div>
                  </div>
                  <div className="text-sm font-semibold">{formatKES((it.price || 0) * (it.quantity || 0))}</div>
                </div>
              ))
            )}
          </div>

          <Separator className="my-4" />

          <div className="text-sm space-y-2">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatKES(subtotal)}</span></div>
            <div className="flex justify-between"><span>Tax (10%)</span><span>{formatKES(tax)}</span></div>
            <Separator />
            <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatKES(total)}</span></div>
          </div>

          <div className="mt-6">
            <Button className="w-full py-3 rounded-md bg-green-500 hover:bg-green-600 text-white" onClick={handlePlaceOrder} disabled={isPlacing}>
              {isPlacing ? "Placing order..." : "Place order"}
            </Button>

            <Button variant="outline" className="w-full mt-3 py-3" onClick={() => navigate(-1)}>
              Back to shop
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
