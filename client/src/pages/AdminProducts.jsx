// src/pages/AdminDashboard.jsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import API from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const fetchProducts = async () => {
  const res = await API.get("/products"); // ✅ now public GET
  return res.data;
};

const AdminDashboard = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [stock, setStock] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState([]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
  });

  // ✅ mutation for adding a product
  const addProduct = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("token"); // assumes you save token on login
      const formData = new FormData();
      formData.append("name", name);
      formData.append("price", price);
      formData.append("category", category);
      formData.append("stock", stock);
      formData.append("description", description);
      for (let i = 0; i < images.length; i++) {
        formData.append("images", images[i]);
      }

      const res = await API.post("/products", formData, {
        headers: {
          Authorization: `Bearer ${token}`, // ✅ admin only
          "Content-Type": "multipart/form-data",
        },
      });
      return res.data;
    },
    onSuccess: () => {
      toast({ title: "Product Added", description: "Product successfully created." });
      queryClient.invalidateQueries(["products"]);
      setName("");
      setPrice("");
      setCategory("");
      setStock("");
      setDescription("");
      setImages([]);
    },
    onError: (err) => {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to add product. Check server logs.",
        variant: "destructive",
      });
    },
  });

  const handleAddProduct = (e) => {
    e.preventDefault();
    addProduct.mutate();
  };

  if (isLoading) return <p className="p-6">Loading products...</p>;

  return (
    <div className="p-6 space-y-6">
      {/* Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Total Products: {products.length}</p>
        </CardContent>
      </Card>

      {/* Add Product */}
      <Card>
        <CardHeader>
          <CardTitle>Add New Product</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddProduct} className="space-y-3">
            <Input placeholder="Product Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            <Input placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
            <Input placeholder="Stock" type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
            <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Input
              type="file"
              multiple
              onChange={(e) => setImages(Array.from(e.target.files))}
              className="cursor-pointer"
            />
            <Button type="submit" disabled={addProduct.isLoading}>
              {addProduct.isLoading ? "Adding..." : "Add Product"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Product List */}
      <Card>
        <CardHeader>
          <CardTitle>All Products</CardTitle>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p>No products available</p>
          ) : (
            <ul className="space-y-2">
              {products.map((product) => (
                <li key={product._id} className="p-2 border rounded">
                  <span className="font-medium">{product.name}</span> — ${product.price} ({product.category})
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
