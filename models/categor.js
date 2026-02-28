const categorySchema = new Schema({
    name: { type: String, required: true },
    userId: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
});

export default model('Category', categorySchema);