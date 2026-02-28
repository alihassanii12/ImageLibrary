import express from "express";
import multer from "multer";
import mongoose from 'mongoose';
import Media from "../models/media.js";
import cloudinary from "../config/cloudinary.js";
import fs from "fs";
import isAuth from "../middleware/isAuth.js";
import path from "path";
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import LockedFolder from "../models/lockedFolder.js";
import Album from "../models/album.js";
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ✅ FIXED: Use /tmp directory for Vercel, local uploads for development
const uploadDir = process.env.NODE_ENV === 'production' 
  ? path.join(os.tmpdir(), 'uploads')  // Vercel ke liye /tmp folder (writable)
  : path.join(__dirname, '../uploads'); // Local development ke liye

// ✅ Create directory if it doesn't exist (safely)
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('✅ Uploads directory created at:', uploadDir);
  } else {
    console.log('✅ Uploads directory exists at:', uploadDir);
  }
} catch (err) {
  console.error('❌ Error creating uploads directory:', err.message);
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, uniqueName + "-" + safeName);
  },
});

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith("image/") ||
    file.mimetype.startsWith("video/")
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only image or video files allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

// Helper to generate hash
const generateUrlHash = (originalName) => {
  return crypto.createHash('sha256').update(originalName + Date.now()).digest('hex').substring(0, 16);
};

// Helper function to calculate user storage
const calculateUserStorage = async (userId) => {
  try {
    const media = await Media.find({ 
      userId: userId,
      isInTrash: false 
    });
    
    const totalUsed = media.reduce((acc, item) => acc + (item.size || 0), 0);
    const totalLimit = 15 * 1024 * 1024 * 1024; // 15GB in bytes
    
    return {
      used: totalUsed,
      total: totalLimit,
      percentage: (totalUsed / totalLimit) * 100
    };
  } catch (err) {
    console.error("Error calculating storage:", err);
    return {
      used: 0,
      total: 15 * 1024 * 1024 * 1024,
      percentage: 0
    };
  }
};

// ==================== STORAGE ROUTES ====================

// Get user storage info
router.get("/storage", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const storage = await calculateUserStorage(req.user.id);
    res.json(storage);

  } catch (err) {
    console.error("Storage fetch error:", err);
    res.status(500).json({ error: "Failed to fetch storage info" });
  }
});

// ==================== UPLOAD ROUTES ====================

// Upload files
router.post("/upload", isAuth, upload.array("files", 10), async (req, res) => {
  let files = req.files;
  
  try {
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const { albumId } = req.body;
    
    console.log('📁 Upload request received:');
    console.log('   - albumId:', albumId || 'none (main library)');
    console.log('   - files:', files?.length || 0);
    console.log('   - uploadDir:', uploadDir);
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const uploadedMedia = [];
    let completed = 0;

    for (const file of files) {
      try {
        const mediaType = file.mimetype.startsWith("video/") ? "video" : "image";
        
        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(file.path, {
          resource_type: mediaType,
          folder: "user_uploads",
          timeout: 120000
        });

        // Create media document
        const mediaDoc = new Media({
          userId: req.user.id,
          originalName: file.originalname,
          mediaType: mediaType,
          url: result.secure_url,
          public_id: result.public_id,
          size: file.size,
          favorite: false,
          isInTrash: false,
          albumId: albumId || null
        });

        await mediaDoc.save();
        console.log(`   - Saved file: ${file.originalname}`);

        // If albumId is provided, add media to the album
        if (albumId) {
          try {
            const album = await Album.findOne({
              _id: albumId,
              userId: req.user.id
            });

            if (album) {
              if (!album.media.includes(mediaDoc._id)) {
                album.media.push(mediaDoc._id);
                await album.save();
              }

              // Update album cover if it's the first media
              if (album.media.length === 1) {
                album.coverUrl = mediaDoc.url;
                await album.save();
              }
            }
          } catch (albumErr) {
            console.error("Error updating album:", albumErr);
          }
        }

        uploadedMedia.push({
          _id: mediaDoc._id,
          url: mediaDoc.url,
          originalName: mediaDoc.originalName,
          type: mediaDoc.mediaType,
          size: mediaDoc.size,
          createdAt: mediaDoc.createdAt,
          albumId: mediaDoc.albumId
        });

        // Clean up temp file
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanErr) {
          console.error("Error cleaning up file:", cleanErr);
        }

        completed++;
        
      } catch (fileErr) {
        console.error("Error processing file:", file.originalname, fileErr);
      }
    }

    // Calculate updated storage
    const storage = await calculateUserStorage(req.user.id);

    console.log('✅ Upload complete. Files saved:', uploadedMedia.length);

    res.status(201).json({ 
      message: `Uploaded ${completed} of ${files.length} files`, 
      media: uploadedMedia,
      storage: storage
    });

  } catch (err) {
    console.error("Upload error:", err);
    
    // Clean up files on error
    if (files) {
      files.forEach(file => {
        try {
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanErr) {
          // Ignore cleanup errors
        }
      });
    }
    
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

// ==================== GET MEDIA ROUTES ====================

// Get user media
router.get("/", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const media = await Media.find({
      userId: req.user.id,
      isInTrash: false
    }).sort({ createdAt: -1 });

    const transformedMedia = media.map(item => ({
      _id: item._id,
      url: item.url,
      originalName: item.originalName,
      type: item.mediaType,
      size: item.size,
      favorite: item.favorite || false,
      albumId: item.albumId || null,
      createdAt: item.createdAt,
      isLocked: item.isLocked || false
    }));

    res.json(transformedMedia);

  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: "Failed to fetch media" });
  }
});

// ==================== FAVORITE ROUTES ====================

// Toggle favorite status
router.post("/:id/favorite", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const media = await Media.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!media) {
      return res.status(404).json({ error: "Media not found" });
    }

    media.favorite = !media.favorite;
    await media.save();

    res.json({ 
      favorite: media.favorite,
      message: media.favorite ? "Added to favorites" : "Removed from favorites"
    });

  } catch (err) {
    console.error("Favorite toggle error:", err);
    res.status(500).json({ error: "Failed to toggle favorite" });
  }
});

// ==================== TRASH ROUTES ====================

// Move to trash
router.post("/:id/trash", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const media = await Media.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!media) {
      return res.status(404).json({ error: "Media not found" });
    }

    media.isInTrash = true;
    media.trashedAt = new Date();
    media.scheduledDeleteAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days
    
    await media.save();

    // Calculate updated storage
    const storage = await calculateUserStorage(req.user.id);

    res.json({ 
      message: "Moved to trash",
      scheduledDeleteAt: media.scheduledDeleteAt,
      storage: storage
    });

  } catch (err) {
    console.error("Trash error:", err);
    res.status(500).json({ error: "Failed to move to trash" });
  }
});

// Restore from trash
router.post("/:id/restore", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const media = await Media.findOne({
      _id: req.params.id,
      userId: req.user.id,
      isInTrash: true
    });

    if (!media) {
      return res.status(404).json({ error: "Media not found in trash" });
    }

    media.isInTrash = false;
    media.trashedAt = null;
    media.scheduledDeleteAt = null;
    
    await media.save();

    // Calculate updated storage
    const storage = await calculateUserStorage(req.user.id);

    res.json({ 
      message: "Restored from trash",
      storage: storage
    });

  } catch (err) {
    console.error("Restore error:", err);
    res.status(500).json({ error: "Failed to restore" });
  }
});

// Get trash
router.get("/trash/all", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const trashedMedia = await Media.find({
      userId: req.user.id,
      isInTrash: true
    }).sort({ trashedAt: -1 });

    const transformedMedia = trashedMedia.map(item => ({
      _id: item._id,
      url: item.url,
      originalName: item.originalName,
      type: item.mediaType,
      size: item.size,
      trashedAt: item.trashedAt,
      scheduledDeleteAt: item.scheduledDeleteAt,
      daysLeft: Math.ceil((item.scheduledDeleteAt - new Date()) / (1000 * 60 * 60 * 24))
    }));

    res.json(transformedMedia);

  } catch (err) {
    console.error("Fetch trash error:", err);
    res.status(500).json({ error: "Failed to fetch trash" });
  }
});

// Bulk trash
router.post("/bulk-trash", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const { mediaIds } = req.body;

    if (!mediaIds || !mediaIds.length) {
      return res.status(400).json({ error: "No media selected" });
    }

    const scheduledDeleteAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

    await Media.updateMany(
      { 
        _id: { $in: mediaIds },
        userId: req.user.id 
      },
      { 
        isInTrash: true,
        trashedAt: new Date(),
        scheduledDeleteAt
      }
    );

    // Calculate updated storage
    const storage = await calculateUserStorage(req.user.id);

    res.json({ 
      message: `${mediaIds.length} items moved to trash`,
      storage: storage
    });

  } catch (err) {
    console.error("Bulk trash error:", err);
    res.status(500).json({ error: "Failed to move to trash" });
  }
});

// Bulk restore
router.post("/bulk-restore", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const { mediaIds } = req.body;

    if (!mediaIds || !mediaIds.length) {
      return res.status(400).json({ error: "No media selected" });
    }

    await Media.updateMany(
      { 
        _id: { $in: mediaIds },
        userId: req.user.id,
        isInTrash: true
      },
      { 
        isInTrash: false,
        trashedAt: null,
        scheduledDeleteAt: null
      }
    );

    // Calculate updated storage
    const storage = await calculateUserStorage(req.user.id);

    res.json({ 
      message: `${mediaIds.length} items restored`,
      storage: storage
    });

  } catch (err) {
    console.error("Bulk restore error:", err);
    res.status(500).json({ error: "Failed to restore" });
  }
});

// ==================== LOCKED FOLDER ROUTES ====================

// Lock media
router.post("/:id/lock", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const media = await Media.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!media) {
      return res.status(404).json({ error: "Media not found" });
    }

    media.isLocked = !media.isLocked;
    media.lockedAt = media.isLocked ? new Date() : null;
    
    await media.save();

    const storage = await calculateUserStorage(req.user.id);

    res.json({ 
      isLocked: media.isLocked,
      message: media.isLocked ? "Moved to locked folder" : "Removed from locked folder",
      storage: storage
    });

  } catch (err) {
    console.error("Lock error:", err);
    res.status(500).json({ error: "Failed to lock media" });
  }
});

// Get locked media
router.get("/locked/all", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const lockedFolder = await LockedFolder.findOne({ userId: req.user.id });
    
    const hasAccess = lockedFolder && 
      lockedFolder.hasAccess && 
      lockedFolder.sessionExpires && 
      lockedFolder.sessionExpires > new Date();

    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied. Please verify password first." });
    }

    const lockedMedia = await Media.find({
      userId: req.user.id,
      isLocked: true,
      isInTrash: false
    }).sort({ lockedAt: -1 });

    const secureMedia = lockedMedia.map(m => ({
      _id: m._id,
      hash: generateUrlHash(m.originalName),
      originalName: m.originalName,
      type: m.mediaType,
      size: m.size,
      lockedAt: m.lockedAt,
      url: m.url,
      albumId: m.albumId
    }));

    res.json(secureMedia);

  } catch (err) {
    console.error("Fetch locked error:", err);
    res.status(500).json({ error: "Failed to fetch locked media" });
  }
});

// Access locked media
router.post("/locked/access/:hash", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const lockedFolder = await LockedFolder.findOne({ userId: req.user.id });
    
    const hasAccess = lockedFolder && 
      lockedFolder.hasAccess && 
      lockedFolder.sessionExpires && 
      lockedFolder.sessionExpires > new Date();

    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied. Please verify password first." });
    }

    const { hash } = req.params;
    
    const media = await Media.findOne({
      userId: req.user.id,
      isLocked: true
    });

    if (!media) {
      return res.status(404).json({ error: "Media not found" });
    }

    const expectedHash = generateUrlHash(media.originalName);
    if (hash !== expectedHash) {
      return res.status(403).json({ error: "Invalid access" });
    }

    res.json({ url: media.url });

  } catch (err) {
    console.error("Access error:", err);
    res.status(500).json({ error: "Failed to access media" });
  }
});

// ==================== PERMANENT DELETE ====================

// Permanent delete
router.delete("/permanent/:id", isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const media = await Media.findOne({
      _id: req.params.id,
      userId: req.user.id,
      isInTrash: true
    });

    if (!media) {
      return res.status(404).json({ error: "Media not found" });
    }

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(media.public_id, {
        resource_type: media.mediaType,
      });
    } catch (cloudinaryErr) {
      console.error("Cloudinary delete error:", cloudinaryErr);
    }

    await media.deleteOne();

    // Calculate updated storage
    const storage = await calculateUserStorage(req.user.id);

    res.json({ 
      message: "Permanently deleted",
      storage: storage
    });

  } catch (err) {
    console.error("Permanent delete error:", err);
    res.status(500).json({ error: "Failed to delete permanently" });
  }
});

// ==================== MOVE MEDIA ROUTES ====================

// Move media to album
router.post('/move-media', isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const { mediaId, targetAlbumId } = req.body;

    if (!mediaId) {
      return res.status(400).json({ error: 'mediaId is required' });
    }

    // Find media
    const media = await Media.findOne({
      _id: mediaId,
      userId: req.user.id
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Remove from current album if exists
    if (media.albumId) {
      const currentAlbum = await Album.findOne({
        _id: media.albumId,
        userId: req.user.id
      });
      
      if (currentAlbum) {
        currentAlbum.media = currentAlbum.media.filter(id => id.toString() !== mediaId);
        await currentAlbum.save();
        
        // Update album cover if needed
        if (currentAlbum.coverUrl === media.url) {
          if (currentAlbum.media.length > 0) {
            const firstMedia = await Media.findById(currentAlbum.media[0]);
            if (firstMedia) {
              currentAlbum.coverUrl = firstMedia.url;
              await currentAlbum.save();
            }
          } else {
            currentAlbum.coverUrl = '';
            await currentAlbum.save();
          }
        }
      }
    }

    // Add to new album if target is provided
    if (targetAlbumId) {
      const targetAlbum = await Album.findOne({
        _id: targetAlbumId,
        userId: req.user.id
      });

      if (!targetAlbum) {
        return res.status(404).json({ error: 'Target album not found' });
      }

      if (!targetAlbum.media.includes(mediaId)) {
        targetAlbum.media.push(mediaId);
        await targetAlbum.save();
      }

      media.albumId = targetAlbumId;
      
      // Update target album's cover if it's the first media
      if (targetAlbum.media.length === 1) {
        targetAlbum.coverUrl = media.url;
        await targetAlbum.save();
      }
    } else {
      // Moving to main library
      media.albumId = null;
    }

    await media.save();

    res.json({ 
      message: targetAlbumId ? 'Media moved to album' : 'Media moved to main library',
      media: {
        _id: media._id,
        url: media.url,
        originalName: media.originalName,
        type: media.mediaType,
        size: media.size,
        favorite: media.favorite,
        albumId: media.albumId,
        createdAt: media.createdAt,
        isLocked: media.isLocked
      }
    });
  } catch (err) {
    console.error('Error moving media:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk move media
router.post('/bulk-move-media', isAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ error: "Database connection error" });
    }

    const { mediaIds, targetAlbumId } = req.body;

    if (!mediaIds || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      return res.status(400).json({ error: 'mediaIds array is required' });
    }

    // Get target album if provided
    let targetAlbum = null;
    if (targetAlbumId) {
      targetAlbum = await Album.findOne({
        _id: targetAlbumId,
        userId: req.user.id
      });

      if (!targetAlbum) {
        return res.status(404).json({ error: 'Target album not found' });
      }
    }

    // Process each media item
    let movedCount = 0;
    for (const mediaId of mediaIds) {
      try {
        const media = await Media.findOne({
          _id: mediaId,
          userId: req.user.id
        });

        if (!media) continue;

        // Remove from current album
        if (media.albumId) {
          const currentAlbum = await Album.findOne({
            _id: media.albumId,
            userId: req.user.id
          });
          
          if (currentAlbum) {
            currentAlbum.media = currentAlbum.media.filter(id => id.toString() !== mediaId);
            await currentAlbum.save();
          }
        }

        // Add to new album
        if (targetAlbum) {
          if (!targetAlbum.media.includes(mediaId)) {
            targetAlbum.media.push(mediaId);
          }
          media.albumId = targetAlbumId;
        } else {
          media.albumId = null;
        }

        await media.save();
        movedCount++;
        
      } catch (itemErr) {
        console.error(`Error processing media ${mediaId}:`, itemErr);
      }
    }

    // Save target album changes
    if (targetAlbum) {
      await targetAlbum.save();
    }

    res.json({ 
      message: `Moved ${movedCount} items successfully`,
      count: movedCount
    });
  } catch (err) {
    console.error('Error bulk moving media:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;