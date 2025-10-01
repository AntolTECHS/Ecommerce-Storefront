// scripts/inspect-products.js
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const list = await Product.find().limit(5).lean();
    console.log(JSON.stringify(list, null, 2));
    await mongoose.disconnect();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
