// middleware/validateObjectId.js
const mongoose = require('mongoose');

module.exports = function validateObjectId(paramName = 'id') {
  return (req, res, next) => {
    const value = req.params[paramName];

    if (typeof value === 'undefined' || value === null) {
      return res.status(400).json({ message: `${paramName} is required` });
    }

    if (String(value).toLowerCase() === 'my') {
      return res
        .status(400)
        .json({ message: `Use /myorders for current user's orders; '${paramName}' should be an ObjectId` });
    }

    if (!mongoose.Types.ObjectId.isValid(String(value))) {
      return res.status(400).json({ message: `Invalid ${paramName}` });
    }

    return next();
  };
};
