import { useParams, useNavigate } from "react-router-dom";
import { products } from "@/data/products.js";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { useState } from "react";

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);

  const product = products.find(p => String(p.id) === id);

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Product not found</p>
        <Button onClick={() => navigate("/")}>Go Home</Button>
      </div>
    );
  }

  const handleAddToCart = () => {
    // Implement your cart logic here
    alert(`Added ${product.name} to cart`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-gray-50 dark:bg-gray-900">
      <img src={product.image} alt={product.name} className="w-64 h-64 object-cover mb-4" />
      <h2 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">{product.name}</h2>
      <p className="text-gray-700 dark:text-gray-300 mb-4">{product.description || "No description available"}</p>
      <p className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">${product.price.toFixed(2)}</p>

      <div className="flex items-center gap-4 mb-4">
        <Button onClick={() => setQuantity(prev => Math.max(prev-1, 1))}>-</Button>
        <span>{quantity}</span>
        <Button onClick={() => setQuantity(prev => prev+1)}>+</Button>
      </div>

      <Button 
        onClick={handleAddToCart} 
        className="flex items-center gap-2 bg-orange-500 text-white hover:bg-orange-600"
      >
        <ShoppingCart className="h-4 w-4" /> Add to Cart
      </Button>
    </div>
  );
}
