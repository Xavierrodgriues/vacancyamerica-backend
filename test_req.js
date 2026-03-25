const mongoose = require('mongoose');
const friendController = require('./controllers/friendController');
const User = require('./models/User');
require('dotenv').config();

async function test() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vacancyamerica');
    
    const users = await User.find().limit(2);
    if (users.length < 2) {
        console.log('Need at least 2 users');
        return;
    }
    const sender = users[0];
    const receiver = users[1];

    const req = {
        params: { id: receiver._id.toString() },
        user: { id: sender._id.toString() },
        app: {
            get: (key) => {
                if (key === 'io') {
                    return {
                        to: () => ({ emit: () => console.log('Mock emit') })
                    }
                }
            }
        }
    };
    
    const res = {
        status: (code) => ({
            json: (data) => console.log(`Response ${code}:`, data)
        })
    };

    console.log(`Sending friend request from ${sender.username} to ${receiver.username}...`);
    try {
        await friendController.sendFriendRequest(req, res);
    } catch(e) {
        console.error("Crash during send:", e);
    }
}

test().then(() => mongoose.disconnect());
