const mongoose = require('mongoose');
const User = require('./models/User');
const Connection = require('./models/Connection');
const FriendRequest = require('./models/FriendRequest'); // The old model

require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vacancyamerica');
    console.log("Connected to MongoDB.");

    // 1. Migrate Old Data (Bypass strictly defined schema using native driver)
    const usersCollection = mongoose.connection.collection('users');
    const users = await usersCollection.find({ friends: { $exists: true, $not: { $size: 0 } } }).toArray();
    
    let migrated = 0;
    for (const user of users) {
        if (!user.friends) continue;
        for (const friendId of user.friends) {
            // Check if connection exists
            const existing = await Connection.findOne({
                $or: [
                    { userId: user._id, friendId: friendId },
                    { userId: friendId, friendId: user._id }
                ]
            });
            if (!existing) {
                await Connection.create({
                    userId: user._id,
                    friendId: friendId,
                    status: 'accepted',
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                migrated++;
            }
        }
    }
    console.log(`Migrated ${migrated} old friend relations into Connection schema.`);

    // 2. Migrate Old Pending Requests
    if (mongoose.models.FriendRequest) {
        const reqs = await FriendRequest.find();
        let reqMigrated = 0;
        for(let r of reqs) {
            const existing = await Connection.findOne({
                $or: [
                    { userId: r.sender, friendId: r.receiver },
                    { userId: r.receiver, friendId: r.sender }
                ]
            });
            if (!existing) {
                await Connection.create({
                    userId: r.sender,
                    friendId: r.receiver,
                    status: 'pending',
                    createdAt: r.createdAt,
                    updatedAt: r.updatedAt
                });
                reqMigrated++;
            }
        }
        console.log(`Migrated ${reqMigrated} old pending friend requests.`);
    }

    mongoose.disconnect();
}

run().catch(console.error);
