const express = require("express");
const sendEmail = require("../utils/sendEmail");
const router = express.Router();

router.get("/test-email", async (req, res) => {
  try {
    await sendEmail({
      to: "yourpersonalemail@gmail.com",
      subject: "Test Email from Brevo + Nodemailer",
      text: "This is a test email",
      html: "<p>This is a <strong>test email</strong> 🎉</p>",
    });
    res.json({ success: true, message: "Email sent!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
