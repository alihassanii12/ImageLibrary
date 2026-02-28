import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const mediaSchema = new Schema({
    userId: { type: Number, required: true, index: true },
    url: { type: String, required: true },
    originalName: { type: String, required: true },
    mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
    size: { type: Number },
    public_id: { type: String },
    favorite: { type: Boolean, default: false },
    albumId: { type: Schema.Types.ObjectId, ref: 'Album', default: null },
    
    // Archive/Trash fields
    isInTrash: { type: Boolean, default: false, index: true },
    trashedAt: { type: Date, default: null },
    scheduledDeleteAt: { type: Date, default: null }, // REMOVED index: true from here
    
    // Lock fields
    isLocked: { type: Boolean, default: false, index: true },
    lockedAt: { type: Date, default: null },
    
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now }
});

// Virtual for 'type' field
mediaSchema.virtual('type').get(function() {
    return this.mediaType;
});

mediaSchema.set('toJSON', { virtuals: true });
mediaSchema.set('toObject', { virtuals: true });

// Index for auto-delete cron job - KEEP THIS ONE
mediaSchema.index({ scheduledDeleteAt: 1 }, { expireAfterSeconds: 0 });

// Compound indexes for common queries
mediaSchema.index({ userId: 1, isInTrash: 1, createdAt: -1 });
mediaSchema.index({ userId: 1, isLocked: 1, isInTrash: 1 });

const Media = mongoose.models.Media || model('Media', mediaSchema);

export default Media;