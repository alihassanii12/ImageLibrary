import "dotenv/config";
import pkg from "pg";

const { Pool } = pkg;

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DB,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

async function initDB() {
  try {

    // USERS TABLE
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        google_id VARCHAR(255),
        google_picture TEXT,
        auth_provider VARCHAR(50) DEFAULT 'local',
        plan VARCHAR(50) DEFAULT 'free',
        storage_used BIGINT DEFAULT 0,
        storage_total BIGINT DEFAULT 16106127360, -- 15GB in bytes

        -- Verify OTP 
        is_otp_verified BOOLEAN DEFAULT false,
        -- Forgot Password OTP
        forget_otp VARCHAR(10),
        forget_otp_expiry TIMESTAMP,

        -- Delete Account OTP
        delete_otp VARCHAR(10),
        delete_otp_expire TIMESTAMP,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // SESSIONS TABLE (with refresh token)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        refresh_token TEXT NOT NULL,
        user_agent TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create index on refresh_token for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token 
      ON sessions(refresh_token);
    `);

    // Create index on user_id for faster queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id 
      ON sessions(user_id);
    `);

    // SUPPORT TICKETS TABLE
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE SET NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ Support tickets table ready");
    console.log("✅ PostgreSQL tables ready (Users + Sessions + Forgot OTP + Delete OTP)");
    process.exit(0);

  } catch (err) {
    console.error("❌ Error creating tables:", err);
    process.exit(1);
  }
}

initDB();