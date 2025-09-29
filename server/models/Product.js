const mongoose = require("mongoose");

// Review Schema
const reviewSchema = new mongoose.Schema(
  {
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    comment: { 
      type: String, 
      required: true,
      trim: true 
    },
    rating: { 
      type: Number, 
      required: true, 
      min: 1, 
      max: 5 
    },
  },
  { timestamps: true }
);

// Product Schema
const productSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true, 
      trim: true 
    },
    description: { 
      type: String, 
      trim: true 
    },
    price: { 
      type: Number, 
      required: true, 
      min: 0 
    },
    category: { 
      type: String, 
      default: "other", 
      index: true // ✅ makes category-based queries faster
    },
    stock: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    images: {
      type: [String],
      default: [],
    },
    rating: { 
      type: Number, 
      default: 0, 
      min: 0, 
      max: 5 
    },
    numReviews: { 
      type: Number, 
      default: 0 
    },
    reviews: [reviewSchema],
  },
  { timestamps: true }
);

// ✅ Method to calculate avg rating
productSchema.methods.calculateRating = function () {
  if (this.reviews.length === 0) {
    this.rating = 0;
    this.numReviews = 0;
  } else {
    this.numReviews = this.reviews.length;
    this.rating =
      this.reviews.reduce((sum, review) => sum + review.rating, 0) /
      this.reviews.length;
  }
  return this.save();
};

module.exports = mongoose.model("Product", productSchema);
