import mongoose from 'mongoose';

const lockedFolderSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  password: { type: String, required: true },
  hasAccess: { type: Boolean, default: false },
  lastAccess: { type: Date },
  sessionExpires: { type: Date }
}, {
  timestamps: true
});

const LockedFolder = mongoose.models.LockedFolder || mongoose.model('LockedFolder', lockedFolderSchema);

export default LockedFolder;