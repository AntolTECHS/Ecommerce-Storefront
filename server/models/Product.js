// models/Product.js
const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    comment: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
  },
  { timestamps: true }
);

// image subdocument: store url and optional public_id (for deletion)
const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    public_id: { type: String, default: null }, // Cloudinary public_id (optional)
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, default: "other", index: true },
    stock: { type: Number, default: 0, min: 0 },

    // images: array of { url, public_id }
    images: {
      type: [imageSchema],
      default: [],
    },

    // legacy single-image field (optional): keep for backward compatibility
    image: { type: String, default: null },

    rating: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0 },
    reviews: [reviewSchema],
  },
  { timestamps: true }
);

/**
 * Pre-save hook: normalize legacy images stored as strings
 * If someone assigns product.images = ['https://...','/uploads/...'] this
 * will convert each string to { url: string, public_id: null } before saving.
 */
productSchema.pre("save", function (next) {
  if (Array.isArray(this.images) && this.images.length > 0) {
    this.images = this.images.map((img) => {
      if (!img) return null;
      if (typeof img === "string") {
        return { url: img, public_id: null };
      }
      // if already object with url -> ensure url exists
      if (typeof img === "object" && img.url) return { url: img.url, public_id: img.public_id || null };
      return null;
    }).filter(Boolean);
  }
  next();
});

// Method to calculate avg rating
productSchema.methods.calculateRating = function () {
  if (!this.reviews || this.reviews.length === 0) {
    this.rating = 0;
    this.numReviews = 0;
  } else {
    this.numReviews = this.reviews.length;
    this.rating = this.reviews.reduce((sum, r) => sum + r.rating, 0) / this.reviews.length;
  }
  return this.save();
};

module.exports = mongoose.model("Product", productSchema);
