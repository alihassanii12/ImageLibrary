import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cookieParser from "cookie-parser";
import pkg from 'pg';
import cors from 'cors';
import events from 'events';

import authRoutes from './routes/auth.js';
import mediaRoutes from './routes/media.js';
import albumRoutes from './routes/albums.js';
import googleRouter from './routes/google.js';
import forgotRouter from './routes/forgotPassword.js';
import deleteAccountRouter from './routes/deleteAccount.js';
import supportRouter from './routes/supportMail.js';
import lockedRoutes from './routes/locked.js';
import './cron/Clean.js';

const { Pool } = pkg;
const app = express();

// Increase max listeners
events.defaultMaxListeners = 20;

// Middleware
app.use(cookieParser());
app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:3001", "https://*.vercel.app"], // Add vercel domain
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// PostgreSQL
const pgPool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DB,
  password: process.env.PG_PASSWORD,
  port: Number(process.env.PG_PORT),
  ssl: {
    rejectUnauthorized: false
  }
});
app.locals.pgPool = pgPool;

// MongoDB Connection with better error handling
const connectMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected successfully');
    
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });
    
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
};

// Don't await here, do it in the request handler or use connection caching
connectMongoDB();

// Routes
app.use('/auth', authRoutes);
app.use('/media', mediaRoutes);
app.use('/albums', albumRoutes);
app.use('/google', googleRouter);
app.use('/forgotPassword', forgotRouter);
app.use('/delete-account', deleteAccountRouter);
app.use('/support', supportRouter);
app.use('/locked', lockedRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🔥 Unhandled error:', {
    timestamp: new Date().toISOString(),
    url: req.url,
    method: req.method,
    error: {
      message: err.message,
      stack: err.stack,
      name: err.name
    }
  });
  
  res.status(500).json({ 
    error: err.message || 'Internal server error'
  });
});

// ❌ REMOVE THIS LINE:
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// ✅ ADD THIS LINE FOR VERCEL:
export default app;