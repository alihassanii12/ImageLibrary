import cron from 'node-cron';
import Media from '../models/media.js';
import cloudinary from '../config/cloudinary.js';

// Run every day at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running cleanup job for expired trash items...');
  
  try {
    const now = new Date();
    
    // Find media that has been in trash for 15+ days
    const expiredMedia = await Media.find({
      isInTrash: true,
      scheduledDeleteAt: { $lte: now }
    });

    console.log(`Found ${expiredMedia.length} items to delete permanently`);

    for (const media of expiredMedia) {
      try {
        // Delete from Cloudinary
        if (media.public_id) {
          await cloudinary.uploader.destroy(media.public_id, {
            resource_type: media.mediaType,
          });
          console.log(`Deleted from Cloudinary: ${media.public_id}`);
        }

        // Delete from database
        await media.deleteOne();
        console.log(`Deleted from database: ${media._id}`);

      } catch (err) {
        console.error(`Error deleting media ${media._id}:`, err);
      }
    }

    console.log('Cleanup job completed');

  } catch (err) {
    console.error('Cleanup job error:', err);
  }
});

export default cron;