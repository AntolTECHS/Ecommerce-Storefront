// src/pages/OrderSuccess.jsx
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function OrderSuccess() {
  const location = useLocation();
  const navigate = useNavigate();
  const orderId = location.state?.orderId || null;
  const total = location.state?.total ?? null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <h2 className="text-2xl font-semibold mb-3">Thank you — your order is confirmed!</h2>
        {orderId ? <p className="text-sm text-muted-foreground mb-4">Order ID: <span className="font-mono">{orderId}</span></p> : null}
        {total !== null ? <p className="text-lg font-semibold mb-4">Total paid: {new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(total)}</p> : null}
        <div className="flex gap-3 justify-center">
          <Button onClick={() => navigate("/")}>Continue shopping</Button>
          <Button variant="outline" onClick={() => navigate("/orders")}>View my orders</Button>
        </div>
      </div>
    </div>
  );
}
