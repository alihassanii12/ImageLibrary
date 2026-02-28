import express from 'express';
import mongoose from 'mongoose';
import Album from '../models/album.js';
import Media from '../models/media.js';
import isAuth from '../middleware/isAuth.js';

const router = express.Router();

// ==================== MONGODB CONNECTION CHECK MIDDLEWARE ====================
// Har route se pehle database connection check karo
router.use(async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.log('🔄 MongoDB connection state:', mongoose.connection.readyState);
      // Agar disconnected hai to wait karo connection ke liye
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ MongoDB reconnected successfully');
      }
    }
    next();
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
    res.status(500).json({ error: "Database connection error" });
  }
});

// Helper function to update album cover
const updateAlbumCover = async (albumId) => {
  try {
    const album = await Album.findById(albumId);
    if (!album) return;
    
    if (album.media && album.media.length > 0) {
      const firstMedia = await Media.findById(album.media[0]);
      if (firstMedia) {
        album.coverUrl = firstMedia.url;
        await album.save();
      }
    } else {
      album.coverUrl = '';
      await album.save();
    }
  } catch (err) {
    console.error('Error updating album cover:', err);
  }
};

// ==================== CREATE ALBUM/FOLDER ====================
router.post('/create', isAuth, async (req, res) => {
    try {
        const { name, description, category, parentAlbumId, isFolder } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        if (parentAlbumId) {
            if (!mongoose.Types.ObjectId.isValid(parentAlbumId)) {
                return res.status(400).json({ error: 'Invalid parent folder ID' });
            }

            const parentAlbum = await Album.findOne({
                _id: parentAlbumId,
                userId: req.user.id
            });

            if (!parentAlbum) {
                return res.status(404).json({ error: 'Parent folder not found' });
            }
        }

        const album = await Album.create({
            userId: req.user.id,
            name,
            description: description || '',
            category: category || 'personal',
            coverUrl: '',
            media: [],
            parentAlbumId: parentAlbumId || null,
            isFolder: isFolder || false
        });

        res.status(201).json(album);
    } catch (err) {
        console.error('Error creating album/folder:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== GET ALL ALBUMS ====================
router.get('/all', isAuth, async (req, res) => {
    try {
        console.log('📁 Fetching all albums for user:', req.user.id);

        const albums = await Album.find({ userId: req.user.id })
            .populate({
                path: 'media',
                options: { sort: { createdAt: -1 } }
            })
            .sort({ createdAt: -1 });

        console.log(`📁 Found ${albums.length} albums`);

        res.json(albums);
    } catch (err) {
        console.error('Error fetching all albums:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== GET ALBUMS/FOLDERS BY PARENT ====================
router.get('/', isAuth, async (req, res) => {
    try {
        const { parentId } = req.query;
        
        let query = { userId: req.user.id };
        
        if (parentId === 'root' || !parentId) {
            query.parentAlbumId = null;
        } else if (mongoose.Types.ObjectId.isValid(parentId)) {
            query.parentAlbumId = parentId;
        } else {
            return res.status(400).json({ error: 'Invalid parent ID' });
        }

        const albums = await Album.find(query)
            .populate({
                path: 'media',
                options: { sort: { createdAt: -1 } }
            })
            .sort({ isFolder: -1, name: 1 });

        res.json(albums);
    } catch (err) {
        console.error('Error fetching albums/folders:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== GET SINGLE ALBUM ====================
router.get('/:albumId', isAuth, async (req, res) => {
    try {
        const { albumId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(albumId)) {
            return res.status(400).json({ error: 'Invalid album ID' });
        }

        const album = await Album.findOne({
            _id: albumId,
            userId: req.user.id
        }).populate({
            path: 'media',
            options: { sort: { createdAt: -1 } }
        });

        if (!album) {
            return res.status(404).json({ error: 'Album not found' });
        }

        res.json(album);
    } catch (err) {
        console.error('Error fetching album:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== GET CHILDREN OF A FOLDER ====================
router.get('/:albumId/children', isAuth, async (req, res) => {
    try {
        const { albumId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(albumId)) {
            return res.status(400).json({ error: 'Invalid folder ID' });
        }

        const parent = await Album.findOne({
            _id: albumId,
            userId: req.user.id
        });

        if (!parent) {
            return res.status(404).json({ error: 'Parent folder not found' });
        }

        const children = await Album.find({
            parentAlbumId: albumId,
            userId: req.user.id
        }).populate({
            path: 'media',
            options: { sort: { createdAt: -1 } }
        }).sort({ isFolder: -1, name: 1 });

        res.json(children);
    } catch (err) {
        console.error('Error fetching children:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== GET ALBUM PATH ====================
router.get('/:albumId/path', isAuth, async (req, res) => {
    try {
        const { albumId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(albumId)) {
            return res.status(400).json({ error: 'Invalid album ID' });
        }

        const path = [];
        let currentId = albumId;

        while (currentId) {
            const album = await Album.findOne({
                _id: currentId,
                userId: req.user.id
            });

            if (!album) break;

            path.unshift({
                _id: album._id,
                name: album.name,
                isFolder: album.isFolder
            });

            currentId = album.parentAlbumId;
        }

        res.json(path);
    } catch (err) {
        console.error('Error fetching album path:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== GET ALBUMS BY USER ID ====================
router.get('/user/:userId', isAuth, async (req, res) => {
    try {
        const { userId } = req.params;

        const numericUserId = Number(userId);

        if (isNaN(numericUserId)) {
            return res.status(400).json({ error: 'Invalid userId' });
        }

        if (numericUserId !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const albums = await Album.find({ userId: numericUserId })
            .populate({
                path: 'media',
                options: { sort: { createdAt: -1 } }
            })
            .sort({ createdAt: -1 });

        res.json(albums);
    } catch (err) {
        console.error('Error fetching albums:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== ADD MEDIA TO ALBUM ====================
router.post('/:albumId/add-media', isAuth, async (req, res) => {
    try {
        const { albumId } = req.params;
        const { mediaId } = req.body;

        if (!mediaId) {
            return res.status(400).json({ error: 'mediaId is required' });
        }

        if (!mongoose.Types.ObjectId.isValid(albumId) || !mongoose.Types.ObjectId.isValid(mediaId)) {
            return res.status(400).json({ error: 'Invalid ID format' });
        }

        const album = await Album.findOne({
            _id: albumId,
            userId: req.user.id
        });

        if (!album) {
            return res.status(404).json({ error: 'Album not found' });
        }

        const media = await Media.findOne({
            _id: mediaId,
            userId: req.user.id
        });

        if (!media) {
            return res.status(404).json({ error: 'Media not found' });
        }

        if (!album.media.includes(mediaId)) {
            album.media.push(mediaId);
            await album.save();

            await Media.findByIdAndUpdate(mediaId, { albumId: album._id });

            if (album.media.length === 1) {
                album.coverUrl = media.url;
                await album.save();
            }
        }

        const updatedAlbum = await Album.findById(albumId).populate('media');
        res.json(updatedAlbum);
    } catch (err) {
        console.error('Error adding media to album:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== REMOVE MEDIA FROM ALBUM ====================
router.delete('/:albumId/remove-media/:mediaId', isAuth, async (req, res) => {
    try {
        const { albumId, mediaId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(albumId) || !mongoose.Types.ObjectId.isValid(mediaId)) {
            return res.status(400).json({ error: 'Invalid ID format' });
        }

        const album = await Album.findOne({
            _id: albumId,
            userId: req.user.id
        });

        if (!album) {
            return res.status(404).json({ error: 'Album not found' });
        }

        album.media = album.media.filter(id => id.toString() !== mediaId);
        await album.save();

        await Media.findByIdAndUpdate(mediaId, { $unset: { albumId: 1 } });

        if (album.media.length === 0) {
            album.coverUrl = '';
            await album.save();
        } else {
            const firstMedia = await Media.findById(album.media[0]);
            if (firstMedia) {
                album.coverUrl = firstMedia.url;
                await album.save();
            }
        }

        res.json({ message: 'Media removed from album' });
    } catch (err) {
        console.error('Error removing media from album:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== MOVE MEDIA TO ALBUM/FOLDER ====================
router.post('/move-media', isAuth, async (req, res) => {
  try {
    const { mediaId, targetAlbumId } = req.body;

    console.log('📁 Move media request:', { mediaId, targetAlbumId });

    if (!mediaId) {
      return res.status(400).json({ error: 'mediaId is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(mediaId)) {
      return res.status(400).json({ error: 'Invalid media ID' });
    }

    if (targetAlbumId && !mongoose.Types.ObjectId.isValid(targetAlbumId)) {
      return res.status(400).json({ error: 'Invalid target album ID' });
    }

    const media = await Media.findOne({
      _id: mediaId,
      userId: req.user.id
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    console.log('📁 Current media albumId:', media.albumId);

    const currentAlbumId = media.albumId;
    
    if (currentAlbumId) {
      const currentAlbum = await Album.findOne({
        _id: currentAlbumId,
        userId: req.user.id
      });
      
      if (currentAlbum) {
        console.log('📁 Removing from current album:', currentAlbum.name);
        currentAlbum.media = currentAlbum.media.filter(id => id.toString() !== mediaId);
        await currentAlbum.save();
        
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

    if (targetAlbumId) {
      const targetAlbum = await Album.findOne({
        _id: targetAlbumId,
        userId: req.user.id
      });

      if (!targetAlbum) {
        return res.status(404).json({ error: 'Target album not found' });
      }

      console.log('📁 Adding to target album:', targetAlbum.name);

      if (!targetAlbum.media.includes(mediaId)) {
        targetAlbum.media.push(mediaId);
        await targetAlbum.save();
      }

      media.albumId = targetAlbumId;
      
      if (targetAlbum.media.length === 1) {
        targetAlbum.coverUrl = media.url;
        await targetAlbum.save();
      }
    } else {
      console.log('📁 Moving to main library');
      media.albumId = null;
    }

    await media.save();

    const updatedMedia = {
      _id: media._id,
      url: media.url,
      originalName: media.originalName,
      type: media.mediaType,
      size: media.size,
      favorite: media.favorite,
      albumId: media.albumId,
      createdAt: media.createdAt,
      isLocked: media.isLocked
    };
    
    console.log('✅ Media moved successfully. New albumId:', media.albumId);

    res.json({ 
      message: targetAlbumId ? 'Media moved to album' : 'Media moved to main library',
      media: updatedMedia
    });
  } catch (err) {
    console.error('Error moving media:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== UPDATE ALBUM ====================
router.put('/:albumId', isAuth, async (req, res) => {
    try {
        const { albumId } = req.params;
        const { name, description, category, coverUrl } = req.body;

        if (!mongoose.Types.ObjectId.isValid(albumId)) {
            return res.status(400).json({ error: 'Invalid album ID' });
        }

        const album = await Album.findOneAndUpdate(
            { _id: albumId, userId: req.user.id },
            {
                name,
                description,
                category,
                coverUrl,
                updatedAt: new Date()
            },
            { new: true }
        ).populate('media');

        if (!album) {
            return res.status(404).json({ error: 'Album not found' });
        }

        res.json(album);
    } catch (err) {
        console.error('Error updating album:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== MOVE ALBUM ====================
router.put('/:albumId/move', isAuth, async (req, res) => {
    try {
        const { albumId } = req.params;
        const { newParentId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(albumId)) {
            return res.status(400).json({ error: 'Invalid album ID' });
        }

        if (newParentId && newParentId !== 'root') {
            if (!mongoose.Types.ObjectId.isValid(newParentId)) {
                return res.status(400).json({ error: 'Invalid parent ID' });
            }

            const newParent = await Album.findOne({
                _id: newParentId,
                userId: req.user.id
            });

            if (!newParent) {
                return res.status(404).json({ error: 'New parent folder not found' });
            }

            let currentParent = newParent;
            while (currentParent) {
                if (currentParent._id.toString() === albumId) {
                    return res.status(400).json({ error: 'Cannot move folder into itself or its descendant' });
                }
                if (!currentParent.parentAlbumId) break;
                currentParent = await Album.findById(currentParent.parentAlbumId);
            }
        }

        const album = await Album.findOneAndUpdate(
            { _id: albumId, userId: req.user.id },
            {
                parentAlbumId: newParentId === 'root' ? null : newParentId,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!album) {
            return res.status(404).json({ error: 'Album not found' });
        }

        res.json(album);
    } catch (err) {
        console.error('Error moving album:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== DELETE ALBUM ====================
router.delete('/:albumId', isAuth, async (req, res) => {
    try {
        const { albumId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(albumId)) {
            return res.status(400).json({ error: 'Invalid album ID' });
        }

        const album = await Album.findOne({
            _id: albumId,
            userId: req.user.id
        });

        if (!album) {
            return res.status(404).json({ error: 'Album not found' });
        }

        const deleteChildren = async (parentId) => {
            const children = await Album.find({ parentAlbumId: parentId });
            for (const child of children) {
                await deleteChildren(child._id);
                
                if (child.media && child.media.length) {
                    await Media.updateMany(
                        { _id: { $in: child.media } },
                        { $unset: { albumId: 1 } }
                    );
                }
                
                await Album.findByIdAndDelete(child._id);
            }
        };

        await deleteChildren(albumId);

        if (album.media && album.media.length) {
            await Media.updateMany(
                { _id: { $in: album.media } },
                { $unset: { albumId: 1 } }
            );
        }

        await Album.findByIdAndDelete(albumId);

        res.json({ message: 'Album and all its contents deleted successfully' });
    } catch (err) {
        console.error('Error deleting album:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;