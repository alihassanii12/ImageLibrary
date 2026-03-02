import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import isAuth from "../middleware/isAuth.js";

const router = express.Router();

/* ================= TOKEN HELPERS ================= */
const generateAccessToken = (user) =>
  jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );

const generateRefreshToken = (user) =>
  jwt.sign({ userId: user.id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });

/* ================= REGISTER ================= */
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  const pool = req.pgPool || req.app?.locals?.pgPool;

  try {
    const exists = await pool.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    if (exists.rows.length) return res.status(400).json({ error: "User exists" });

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password, auth_provider)
       VALUES ($1, $2, $3, 'local') RETURNING id, name, email, role`,
      [name, email, hashed]
    );
    const user = result.rows[0];

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save session in DB
    await pool.query(
      `INSERT INTO sessions (user_id, refresh_token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken]
    );

    // Send tokens in JSON (no cookies)
    res.status(201).json({
      message: "Registration successful",
      accessToken,
      refreshToken,
      user,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

/* ================= LOGIN ================= */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const pool = req.pgPool || req.app?.locals?.pgPool;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (!result.rows.length) return res.status(400).json({ error: "User not found" });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Invalid credentials" });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await pool.query(
      `INSERT INTO sessions (user_id, refresh_token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshToken]
    );

    res.json({
      message: "Login successful",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

/* ================= REFRESH TOKEN ================= */
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  const pool = req.pgPool || req.app?.locals?.pgPool;

  if (!refreshToken) return res.status(401).json({ error: "No refresh token" });

  try {
    const session = await pool.query(
      `SELECT user_id FROM sessions
       WHERE refresh_token = $1 AND expires_at > NOW()`,
      [refreshToken]
    );
    if (!session.rows.length) return res.status(401).json({ error: "Invalid refresh token" });

    const userResult = await pool.query(
      "SELECT id, email, role FROM users WHERE id = $1",
      [session.rows[0].user_id]
    );
    const user = userResult.rows[0];

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Update session
    await pool.query(
      `UPDATE sessions SET refresh_token=$1, expires_at=NOW() + INTERVAL '7 days'
       WHERE user_id=$2`,
      [newRefreshToken, user.id]
    );

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error(err);
    res.status(403).json({ error: "Refresh failed" });
  }
});

/* ================= LOGOUT ================= */
router.post("/logout", async (req, res) => {
  const { refreshToken } = req.body;
  const pool = req.pgPool || req.app?.locals?.pgPool;

  if (refreshToken && pool) {
    await pool.query("DELETE FROM sessions WHERE refresh_token=$1", [refreshToken]);
  }

  res.json({ success: true });
});

/* ================= CURRENT USER ================= */
router.get("/me", isAuth, async (req, res) => {
  const pool = req.pgPool || req.app?.locals?.pgPool;

  try {
    const result = await pool.query(
      `SELECT id, name, email, role, plan, google_picture, auth_provider 
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];
    
    res.json({ 
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        avatar: user.google_picture,
        auth_provider: user.auth_provider || 'local'
      }
    });

  } catch (err) {
    console.error('❌ Get user error:', err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

export default router;