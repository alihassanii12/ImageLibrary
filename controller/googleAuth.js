import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* =========================
   GOOGLE AUTH CONTROLLER
========================= */

const googleAuth = async (req, res) => {
  try {
    const { token } = req.body;
    const pool = req.app.locals.pgPool;

    if (!token) {
      return res.status(400).json({ error: "Google token missing" });
    }

    /* ---------- VERIFY GOOGLE TOKEN ---------- */
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, sub, picture } = payload;

    /* ---------- USER ---------- */
    let result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    let user;

    if (result.rows.length) {
      user = result.rows[0];

      // Update existing user with Google info if needed
      if (!user.google_id) {
        await pool.query(
          `UPDATE users
           SET google_id = $1, 
               auth_provider = 'google',
               google_picture = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [sub, picture, user.id]
        );
      } else if (user.google_picture !== picture) {
        // Update picture if changed
        await pool.query(
          `UPDATE users
           SET google_picture = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [picture, user.id]
        );
      }
    } else {
      const insert = await pool.query(
        `INSERT INTO users (name, email, google_id, google_picture, auth_provider, plan, storage_used, storage_total)
         VALUES ($1, $2, $3, $4, 'google', 'free', 0, 16106127360)
         RETURNING id, name, email, role, plan, google_picture, storage_used, storage_total`,
        [name, email, sub, picture]
      );

      user = insert.rows[0];
    }

    // Get fresh user data after potential updates
    const freshUser = await pool.query(
      `SELECT id, name, email, role, plan, google_picture, storage_used, storage_total 
       FROM users WHERE id = $1`,
      [user.id || user.id]
    );
    
    user = freshUser.rows[0];

    /* ---------- TOKENS ---------- */
    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    /* ---------- STORE SESSION ---------- */
    // Get client IP and user agent
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    await pool.query(
      `INSERT INTO sessions (user_id, refresh_token, expires_at, ip_address, user_agent)
       VALUES ($1, $2, NOW() + INTERVAL '7 days', $3, $4)`,
      [user.id, refreshToken, ipAddress, userAgent]
    );

    /* ---------- COOKIES ---------- */
    res.cookie("token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(200).json({ 
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        avatar: user.google_picture,
        storageUsed: user.storage_used,
        storageTotal: user.storage_total
      }
    });

  } catch (error) {
    console.error("Google Auth Error:", error);
    return res.status(500).json({
      error: "Google authentication failed",
    });
  }
};

export default googleAuth;