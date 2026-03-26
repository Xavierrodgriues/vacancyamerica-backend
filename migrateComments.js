const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const Post = require('./models/Post');
const Comment = require('./models/Comment');

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const posts = await Post.find({});
        console.log(`Found ${posts.length} posts to migrate...`);

        for (const post of posts) {
            const count = await Comment.countDocuments({ post_id: post._id, deleted: { $ne: true } });
            post.commentsCount = count;
            await post.save();
        }

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        process.exit();
    }
}

migrate();
