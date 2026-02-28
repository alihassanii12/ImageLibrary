import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://ayanmehar5496_db_user:OktJGc8mgPK0ySGo@image.rlokyor.mongodb.net/?appName=Image';

console.log('🔍 Testing MongoDB Atlas connection...');
console.log('Connection string exists:', !!MONGODB_URI);

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ SUCCESS: Connected to MongoDB Atlas!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ ERROR:', err.message);
    process.exit(1);
  });