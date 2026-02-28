import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const albumSchema = new Schema({
    userId: { type: Number, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, default: 'personal' },
    coverUrl: { type: String, default: '' },
    media: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    parentAlbumId: { type: Schema.Types.ObjectId, ref: 'Album', default: null, index: true },
    isFolder: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now }
});

// Compound indexes
albumSchema.index({ userId: 1, parentAlbumId: 1 });
albumSchema.index({ userId: 1, isFolder: 1 });

const Album = mongoose.models.Album || model('Album', albumSchema);

export default Album;