const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        try {
            await mongoose.connection.db.collection('users').dropIndex('googleId_1');
            console.log('Dropped old googleId_1 index');
        } catch (e) {
            // Index might not exist
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
