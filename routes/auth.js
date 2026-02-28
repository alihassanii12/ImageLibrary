import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import isAuth from "../middleware/isAuth.js";

const router = express.Router();

/* ================= COOKIE OPTIONS ================= */

const accessCookieOptions = {
  httpOnly: true,
  secure: false, // change to true in production (HTTPS)
  sameSite: "lax",
  path: "/",
  maxAge: 15 * 24 *60*  60 * 1000
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: false,
  sameSite: "lax",
  path: "/",
  maxAge: 7 * 60 * 1000
};

/* ================= TOKEN HELPERS ================= */

const generateAccessToken = (user) =>
  jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );

const generateRefreshToken = () =>
  jwt.sign({}, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "7d"
  });

/* ================= REGISTER ================= */

router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  const pool = req.app.locals.pgPool;

  try {
    const exists = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (exists.rows.length)
      return res.status(400).json({ error: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name,email,password,auth_provider)
       VALUES ($1,$2,$3,'local')
       RETURNING id,name,email,role`,
      [name, email, hashed]
    );

    const user = result.rows[0];

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    await pool.query(
      `INSERT INTO sessions (user_id,refresh_token,expires_at)
       VALUES ($1,$2,NOW()+INTERVAL '7 days')`,
      [user.id, refreshToken]
    );

    res.cookie("token", accessToken, accessCookieOptions);
    res.cookie("refreshToken", refreshToken, refreshCookieOptions);

    res.json({ user });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

/* ================= LOGIN ================= */

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const pool = req.app.locals.pgPool;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (!result.rows.length)
      return res.status(400).json({ error: "User not found" });

    const user = result.rows[0];

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ error: "Invalid credentials" });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    await pool.query(
      `INSERT INTO sessions (user_id,refresh_token,expires_at)
       VALUES ($1,$2,NOW()+INTERVAL '7 days')`,
      [user.id, refreshToken]
    );

    res.cookie("token", accessToken, accessCookieOptions);
    res.cookie("refreshToken", refreshToken, refreshCookieOptions);

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

/* ================= REFRESH ================= */

router.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  const pool = req.app.locals.pgPool;

  if (!refreshToken)
    return res.status(401).json({ error: "No refresh token" });

  try {
    const session = await pool.query(
      `SELECT user_id FROM sessions
       WHERE refresh_token = $1 AND expires_at > NOW()`,
      [refreshToken]
    );

    if (!session.rows.length)
      return res.status(401).json({ error: "Invalid refresh token" });

    const user = await pool.query(
      "SELECT id,email,role FROM users WHERE id=$1",
      [session.rows[0].user_id]
    );

    const newAccessToken = generateAccessToken(user.rows[0]);

    res.cookie("token", newAccessToken, accessCookieOptions);

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(403).json({ error: "Token refresh failed" });
  }
});

/* ================= LOGOUT ================= */

router.post("/logout", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  const pool = req.app.locals.pgPool;

  if (refreshToken) {
    await pool.query(
      "DELETE FROM sessions WHERE refresh_token = $1",
      [refreshToken]
    );
  }

  res.clearCookie("token");
  res.clearCookie("refreshToken");

  res.json({ success: true });
});

/* ================= CURRENT USER ================= */
// backend/routes/auth.js
router.get("/me", isAuth, async (req, res) => {
  const pool = req.app.locals.pgPool;

  try {
    const result = await pool.query(
      "SELECT id, name, email, role, plan, google_picture, auth_provider FROM users WHERE id = $1",
      [req.user.id]
    );

    if (!result.rows.length)
      return res.status(404).json({ error: "User not found" });

    const user = result.rows[0];
    
    res.json({ 
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        avatar: user.google_picture, // 👈 google_picture ko avatar mein map karo
        auth_provider: user.auth_provider || 'local'
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});
export default router;