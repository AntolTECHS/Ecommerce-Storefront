// scripts/preview-migration.js
require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Product"); // path from project root

const MONGO = process.env.MONGO_URI;
if (!MONGO) {
  console.error("Please set MONGO_URI in .env");
  process.exit(1);
}

async function preview() {
  await mongoose.connect(MONGO, {});

  // Count docs where images array contains string elements
  const countImagesWithStrings = await Product.countDocuments({
    images: { $elemMatch: { $type: "string" } },
  });

  // Count docs where images is missing or empty and legacy image exists
  const countLegacySingleImage = await Product.countDocuments({
    $and: [
      { $or: [{ images: { $exists: false } }, { images: { $size: 0 } }] },
      { image: { $exists: true, $ne: null } },
    ],
  });

  // Count docs with no images at all (fully missing)
  const countNoImages = await Product.countDocuments({
    $or: [{ images: { $exists: false } }, { images: { $size: 0 } }],
    $and: [{ $or: [{ image: { $exists: false } }, { image: null }] }],
  });

  console.log("=== Migration preview ===");
  console.log("Documents with string entries inside images[]:", countImagesWithStrings);
  console.log("Documents with empty/no images[] but legacy image field present:", countLegacySingleImage);
  console.log("Documents with no images or legacy image (empty):", countNoImages);
  console.log("Total documents in collection:", await Product.countDocuments());

  await mongoose.disconnect();
  process.exit(0);
}

preview().catch((err) => {
  console.error("Preview script error:", err);
  process.exit(2);
});
