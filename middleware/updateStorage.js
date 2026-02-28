// middleware/updateStorage.js
import pool from '../config/database.js';

const updateStorage = async (req, res, next) => {
  try {
    // This will be called after media operations
    const userId = req.user?.id;
    
    if (userId) {
      // Calculate total storage used from media table
      const mediaResult = await pool.query(
        `SELECT COALESCE(SUM(size), 0) as total_used 
         FROM media 
         WHERE user_id = $1 AND is_in_trash = false`,
        [userId]
      );
      
      const storageUsed = parseInt(mediaResult.rows[0].total_used);
      
      // Update user's storage_used
      await pool.query(
        `UPDATE users SET storage_used = $1 WHERE id = $2`,
        [storageUsed, userId]
      );
    }
    
    next();
  } catch (error) {
    console.error('Storage update error:', error);
    next(error);
  }
};

export default updateStorage;