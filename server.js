import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import mongoose from 'mongoose';

// DB - Serverless connections
import { connectMongoDB, getPostgresPool } from './config/db.js';

// Routes
import authRoutes from './routes/auth.js';
import mediaRoutes from './routes/media.js';
import albumRoutes from './routes/albums.js';
import googleRouter from './routes/google.js';
import forgotRouter from './routes/forgotPassword.js';
import deleteAccountRouter from './routes/deleteAccount.js';
import supportRouter from './routes/supportMail.js';
import lockedRoutes from './routes/locked.js';

const app = express();

// ==================== MIDDLEWARE ====================
app.use(cookieParser());

// ✅ FIXED CORS - removed trailing slash from URL
app.use(cors({
  origin: [
    "http://localhost:3000", 
    "http://localhost:3001",
    "https://imagelibraryfrontendapp.vercel.app", // ⚠️ Removed trailing slash
    "https://*.vercel.app"
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Database connection middleware
app.use(async (req, res, next) => {
  try {
    req.pgPool = await getPostgresPool();
    next();
  } catch (err) {
    console.error('DB Middleware Error:', err);
    next(err);
  }
});

// ==================== ROUTES ====================
app.get('/', (req, res) => {
  res.json({
    message: 'Image Library API',
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', async (req, res) => {
  const status = {
    mongodb: 'disconnected',
    postgres: 'disconnected'
  };
  
  try {
    const pgPool = await getPostgresPool();
    const pgClient = await pgPool.connect();
    await pgClient.query('SELECT 1');
    pgClient.release();
    status.postgres = 'connected';
  } catch (err) {
    console.error('PostgreSQL health check failed:', err.message);
  }
  
  try {
    if (mongoose.connection.readyState === 1) {
      status.mongodb = 'connected';
    } else {
      await connectMongoDB();
      status.mongodb = 'connected';
    }
  } catch (err) {
    console.error('MongoDB health check failed:', err.message);
  }
  
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: status,
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

// Mount all routes
app.use('/auth', authRoutes);
app.use('/media', mediaRoutes);
app.use('/albums', albumRoutes);
app.use('/google', googleRouter);
app.use('/forgotPassword', forgotRouter);
app.use('/delete-account', deleteAccountRouter);
app.use('/support', supportRouter);
app.use('/locked', lockedRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🔥 Error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

export default app;