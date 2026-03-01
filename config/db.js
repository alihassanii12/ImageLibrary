import mongoose from 'mongoose';
import pkg from 'pg';
const { Pool } = pkg;

// ==================== MONGODB (Serverless Optimized) ====================
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export const connectMongoDB = async () => {
  if (cached.conn) {
    console.log('✅ Using cached MongoDB connection');
    return cached.conn;
  }

  if (!cached.promise) {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined in environment");
    }

    console.log('🔍 Creating new MongoDB connection...');
    
    const opts = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 10000,
      connectTimeoutMS: 10000,
    };

    cached.promise = mongoose.connect(process.env.MONGO_URI, opts)
      .then(mongoose => {
        console.log('✅ MongoDB connected successfully');
        return mongoose;
      })
      .catch(err => {
        console.error('❌ MongoDB connection failed:', err);
        cached.promise = null;
        throw err;
      });
  }
  
  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
  
  return cached.conn;
};

// ==================== POSTGRESQL (Serverless Optimized) ====================
let pgPool = null;
let poolPromise = null;

export const getPostgresPool = async () => {
  console.log('🔍 getPostgresPool() called at:', new Date().toISOString());
  
  if (pgPool) {
    console.log('✅ Using existing pool');
    return pgPool;
  }

  if (poolPromise) {
    console.log('⏳ Waiting for existing pool promise');
    return poolPromise;
  }

  console.log('🔄 Creating new PostgreSQL pool...');

  poolPromise = new Promise((resolve, reject) => {
    try {
      const required = ['PG_USER', 'PG_PASSWORD', 'PG_HOST', 'PG_PORT', 'PG_DB'];
      const missing = required.filter(key => !process.env[key]);

      if (missing.length > 0) {
        throw new Error(`Missing PostgreSQL environment variables: ${missing.join(', ')}`);
      }

      console.log('📊 PostgreSQL Config:', {
        host: process.env.PG_HOST,
        database: process.env.PG_DB,
        user: process.env.PG_USER,
        port: process.env.PG_PORT,
        ssl: process.env.NODE_ENV === 'production'
      });

      // ✅ OPTIMIZED FOR SERVERLESS (Neon.tech)
      const pool = new Pool({
        user: process.env.PG_USER,
        host: process.env.PG_HOST,
        database: process.env.PG_DB,
        password: process.env.PG_PASSWORD,
        port: Number(process.env.PG_PORT),
        ssl: process.env.NODE_ENV === 'production' ? { 
          rejectUnauthorized: false,
          sslmode: 'require'
        } : false,
        // ✅ Serverless optimized settings
        max: 3,                    // Max connections (reduce from 5)
        min: 0,                     // Min connections (allow 0 idle)
        idleTimeoutMillis: 3000,    // Close idle connections faster (3 sec)
        connectionTimeoutMillis: 3000, // Connection timeout
        maxUses: 3000,              // Reconnect after 3000 queries
        allowExitOnIdle: true,      // Allow pool to exit when idle
      });

      pool.on('error', (err) => {
        console.error('❌ PostgreSQL pool error:', err);
        pgPool = null;
        poolPromise = null;
      });

      pool.on('connect', () => {
        console.log('🔌 PostgreSQL client connected');
      });

      pool.on('remove', () => {
        console.log('🔌 PostgreSQL client removed');
      });

      // Test connection - but don't keep it open
      pool.connect((err, client, done) => {
        if (err) {
          console.error('❌ PostgreSQL connection test failed:', err);
          console.error('Connection details:', {
            host: process.env.PG_HOST,
            database: process.env.PG_DB,
            user: process.env.PG_USER,
            port: process.env.PG_PORT
          });
          poolPromise = null;
          reject(err);
        } else {
          console.log('✅ PostgreSQL pool created and tested successfully');
          
          // Test query
          client.query('SELECT NOW()', (queryErr, result) => {
            if (queryErr) {
              console.error('❌ Test query failed:', queryErr);
            } else {
              console.log('✅ Test query successful:', result.rows[0].now);
            }
            done(); // Release client immediately
            pgPool = pool;
            resolve(pool);
          });
        }
      });
    } catch (err) {
      console.error('❌ Error creating pool:', err);
      poolPromise = null;
      reject(err);
    }
  });

  return poolPromise;
};

export const closeConnections = async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    cached.conn = null;
    cached.promise = null;
    console.log('🔌 MongoDB connection closed');
  }
  
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
    poolPromise = null;
    console.log('🔌 PostgreSQL pool closed');
  }
};