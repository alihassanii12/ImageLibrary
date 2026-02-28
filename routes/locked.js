import express from "express";
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import isAuth from "../middleware/isAuth.js";
import LockedFolder from "../models/lockedFolder.js";

const router = express.Router();

// Check if user has a password set
router.get("/has-password", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const lockedFolder = await LockedFolder.findOne({ userId: req.user.id });
    res.json({ hasPassword: !!lockedFolder });
  } catch (err) {
    console.error("Check password error:", err);
    res.status(500).json({ error: "Failed to check password" });
  }
});

// Set password for locked folder
router.post("/set-password", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const { password } = req.body;
    
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await LockedFolder.findOneAndUpdate(
      { userId: req.user.id },
      { 
        userId: req.user.id,
        password: hashedPassword,
        hasAccess: true,
        lastAccess: new Date(),
        sessionExpires: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      },
      { upsert: true, new: true }
    );

    res.json({ message: "Password set successfully" });
  } catch (err) {
    console.error("Set password error:", err);
    res.status(500).json({ error: "Failed to set password" });
  }
});

// Verify password
router.post("/verify-password", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: "Password required" });
    }

    const lockedFolder = await LockedFolder.findOne({ userId: req.user.id });
    
    if (!lockedFolder) {
      return res.status(404).json({ error: "No password set. Please set a password first." });
    }

    const isValid = await bcrypt.compare(password, lockedFolder.password);
    
    if (!isValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    lockedFolder.hasAccess = true;
    lockedFolder.lastAccess = new Date();
    lockedFolder.sessionExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    await lockedFolder.save();

    res.json({ valid: true, message: "Access granted for 5 minutes" });
  } catch (err) {
    console.error("Verify password error:", err);
    res.status(500).json({ error: "Failed to verify password" });
  }
});

// Check access
router.get("/check-access", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const lockedFolder = await LockedFolder.findOne({ userId: req.user.id });
    
    const hasAccess = lockedFolder && 
      lockedFolder.hasAccess && 
      lockedFolder.sessionExpires && 
      lockedFolder.sessionExpires > new Date();

    // If has access, update last access time
    if (hasAccess) {
      lockedFolder.lastAccess = new Date();
      await lockedFolder.save();
    }

    res.json({ hasAccess: !!hasAccess });
  } catch (err) {
    console.error("Access check error:", err);
    res.status(500).json({ error: "Failed to check access" });
  }
});

// Refresh access (called when user interacts with locked section)
router.post("/refresh-access", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const lockedFolder = await LockedFolder.findOne({ userId: req.user.id });
    
    if (!lockedFolder || !lockedFolder.hasAccess || lockedFolder.sessionExpires <= new Date()) {
      return res.status(401).json({ error: "Access expired" });
    }

    // Extend session by 5 minutes from now
    lockedFolder.sessionExpires = new Date(Date.now() + 5 * 60 * 1000);
    lockedFolder.lastAccess = new Date();
    await lockedFolder.save();

    res.json({ message: "Access refreshed", expiresAt: lockedFolder.sessionExpires });
  } catch (err) {
    console.error("Refresh access error:", err);
    res.status(500).json({ error: "Failed to refresh access" });
  }
});

// Clear access (logout from locked folder)
router.post("/clear-access", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    await LockedFolder.findOneAndUpdate(
      { userId: req.user.id },
      { hasAccess: false, sessionExpires: null }
    );

    res.json({ message: "Access cleared" });
  } catch (err) {
    console.error("Clear access error:", err);
    res.status(500).json({ error: "Failed to clear access" });
  }
});

export default router;