import headphones from "@/assets/product-headphones.png";
import watch from "@/assets/product-watch.png";
import laptop from "@/assets/product-laptop.png";

export const products = [
  {
    id: "1",
    name: "Premium Wireless Headphones",
    price: 299.99,
    originalPrice: 399.99,
    image: headphones,
    rating: 4.8,
    reviewCount: 1247,
    category: "Audio",
    isNew: false,
    isSale: true,
  },
  {
    id: "2",
    name: "Smart Fitness Watch",
    price: 249.99,
    image: watch,
    rating: 4.6,
    reviewCount: 892,
    category: "Wearables",
    isNew: true,
    isSale: false,
  },
  {
    id: "3",
    name: "Professional Laptop",
    price: 1299.99,
    originalPrice: 1499.99,
    image: laptop,
    rating: 4.9,
    reviewCount: 567,
    category: "Computers",
    isNew: false,
    isSale: true,
  },
  {
    id: "4",
    name: "Wireless Gaming Mouse",
    price: 89.99,
    image: headphones, // Using headphones as placeholder
    rating: 4.5,
    reviewCount: 324,
    category: "Gaming",
    isNew: true,
    isSale: false,
  },
  {
    id: "5",
    name: "4K Monitor",
    price: 449.99,
    originalPrice: 549.99,
    image: laptop, // Using laptop as placeholder
    rating: 4.7,
    reviewCount: 198,
    category: "Monitors",
    isNew: false,
    isSale: true,
  },
  {
    id: "6",
    name: "Mechanical Keyboard",
    price: 159.99,
    image: watch, // Using watch as placeholder
    rating: 4.4,
    reviewCount: 445,
    category: "Accessories",
    isNew: false,
    isSale: false,
  },
  {
    id: "7",
    name: "Wireless Charger",
    price: 39.99,
    originalPrice: 59.99,
    image: headphones, // Using headphones as placeholder
    rating: 4.3,
    reviewCount: 167,
    category: "Accessories",
    isNew: false,
    isSale: true,
  },
  {
    id: "8",
    name: "Bluetooth Speaker",
    price: 79.99,
    image: watch, // Using watch as placeholder
    rating: 4.6,
    reviewCount: 289,
    category: "Audio",
    isNew: true,
    isSale: false,
  },
];