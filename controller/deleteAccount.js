import jwt from "jsonwebtoken";
import sendMail from "../config/mail.js";

// Middleware to authenticate user from cookie
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    
    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.userId = decoded.userId;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// STEP 1: Send OTP
export const sendDeleteOtp = async (req, res) => {
  try {
    // First authenticate the user
    await authenticateUser(req, res, async () => {
      const pool = req.app.locals.pgPool;
      const userId = req.userId;

      console.log(`Sending delete OTP for user ID: ${userId}`);

      // Get user email
      const result = await pool.query(
        "SELECT email FROM users WHERE id=$1",
        [userId]
      );

      if (!result.rows.length) {
        return res.status(404).json({ message: "User not found" });
      }

      const email = result.rows[0].email;
      
      // Generate 4-digit OTP
      const otp = Math.floor(1000 + Math.random() * 9000).toString();

      // Store OTP in database with expiry (10 minutes)
      await pool.query(
        `UPDATE users 
         SET delete_otp=$1, 
             delete_otp_expire=NOW() + INTERVAL '10 minutes' 
         WHERE id=$2`,
        [otp, userId]
      );

      // Send email
      await sendMail(
        email,
        `Your account deletion OTP is: ${otp}. This OTP is valid for 10 minutes.`
      );

      // Hide part of email for privacy
      const hiddenEmail = email.replace(/(.{2})(.*)(?=@)/, "$1***");
      
      res.json({ 
        message: "OTP sent to your email ✅",
        email: hiddenEmail 
      });
    });
  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({ message: "Failed to send OTP" });
  }
};

// STEP 2: Verify OTP & Delete Account
export const deleteAccount = async (req, res) => {
  try {
    // First authenticate the user
    await authenticateUser(req, res, async () => {
      const { otp } = req.body;
      const pool = req.app.locals.pgPool;
      const userId = req.userId;

      console.log(`Verifying delete OTP for user ID: ${userId}`);

      if (!otp) {
        return res.status(400).json({ message: "OTP is required" });
      }

      // Get user's OTP and expiry
      const result = await pool.query(
        "SELECT delete_otp, delete_otp_expire FROM users WHERE id=$1",
        [userId]
      );

      if (!result.rows.length) {
        return res.status(404).json({ message: "User not found" });
      }

      const { delete_otp, delete_otp_expire } = result.rows[0];

      // Check if OTP exists
      if (!delete_otp) {
        return res.status(400).json({ message: "No OTP found. Please request again." });
      }

      // Check if OTP matches (convert both to string for comparison)
      if (delete_otp.toString() !== otp.toString().trim()) {
        return res.status(400).json({ message: "Invalid OTP" });
      }

      // Check if OTP is expired
      const expiryDate = new Date(delete_otp_expire);
      const now = new Date();
      
      if (now > expiryDate) {
        return res.status(400).json({ message: "OTP expired. Please request again." });
      }

      console.log(`OTP verified successfully for user: ${userId}`);

      // Delete user's media from storage (optional - implement if needed)
      // await deleteUserMedia(userId);

      // Delete user from database
      await pool.query("DELETE FROM users WHERE id=$1", [userId]);

      console.log(`User ${userId} deleted successfully`);

      // Clear cookies
      res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/"
      });

      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/"
      });

      res.json({ message: "Account deleted successfully ✅" });
    });
  } catch (err) {
    console.error("Delete account error:", err);
    res.status(500).json({ message: "Failed to delete account" });
  }
};