import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Heart, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const ProductCard = ({ product }) => {
  const navigate = useNavigate();

  return (
    <Card 
      className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden"
      onClick={() => navigate(`/product/${product.id}`)}
    >
      <div className="relative overflow-hidden">
        <div className="aspect-square bg-gray-100 dark:bg-zinc-700 flex items-center justify-center overflow-hidden">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {product.isNew && <Badge className="bg-green-500 text-white">New</Badge>}
          {product.isSale && product.originalPrice && <Badge className="bg-red-500 text-white">-{Math.round(((product.originalPrice - product.price)/product.originalPrice)*100)}%</Badge>}
        </div>
      </div>

      <CardContent className="p-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">{product.name}</h3>
        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">${product.price.toFixed(2)}</p>
      </CardContent>
    </Card>
  );
};
