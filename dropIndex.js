require('dotenv').config();
const mongoose = require('mongoose');

const dropIndex = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected');
        const db = mongoose.connection.db;
        await db.collection('users').dropIndex('googleId_1');
        console.log('Index googleId_1 dropped successfully');
    } catch (error) {
        if (error.code === 27) {
            console.log('Index does not exist');
        } else {
            console.error('Error dropping index:', error.message);
        }
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

dropIndex();
