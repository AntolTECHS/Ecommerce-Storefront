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
 * Clean API output: convert _id to id, remove __v
 */
productSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

/**
 * Pre-save hook: normalize legacy images stored as strings.
 * Converts:
 *  - ['https://...','/uploads/...']  -> [{ url, public_id: null }, ...]
 *  - keeps objects with .url as-is (ensures public_id exists)
 */
productSchema.pre("save", function (next) {
  try {
    if (Array.isArray(this.images) && this.images.length > 0) {
      this.images = this.images
        .map((img) => {
          if (!img) return null;
          if (typeof img === "string") {
            return { url: img, public_id: null };
          }
          if (typeof img === "object" && img.url) {
            return { url: img.url, public_id: img.public_id || null };
          }
          return null;
        })
        .filter(Boolean);
    }

    // If no images but legacy single image present, promote it
    if ((!Array.isArray(this.images) || this.images.length === 0) && this.image) {
      this.images = [{ url: this.image, public_id: null }];
    }

    next();
  } catch (err) {
    next(err);
  }
});

/**
 * Method to calculate avg rating and numReviews
 */
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

/* === Indexes === */
// Text index for search (optional but useful if you plan search)
productSchema.index({ name: "text", description: "text" });
// Index for createdAt if you often sort by date
productSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Product", productSchema);
