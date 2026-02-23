const mongoose = require('mongoose');
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// Derive a 32-byte key from the environment secret (cached)
let _cachedKey = null;
function getEncryptionKey() {
    if (!_cachedKey) {
        const secret = process.env.CHAT_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fallback-secret';
        _cachedKey = crypto.createHash('sha256').update(secret).digest();
    }
    return _cachedKey;
}

function encrypt(text) {
    if (!text) return text;
    try {
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        let encrypted = cipher.update(text, 'utf8');
        const final = cipher.final();
        const ciphertext = Buffer.concat([encrypted, final]);
        const authTag = cipher.getAuthTag(); // 16 bytes

        // Combine: iv(16) + authTag(16) + ciphertext → base64
        const combined = Buffer.concat([iv, authTag, ciphertext]);
        return 'enc:' + combined.toString('base64');
    } catch (err) {
        console.error('[Encrypt] Error:', err.message);
        return text; // fallback to plaintext
    }
}

function decrypt(encryptedText) {
    if (!encryptedText) return encryptedText;

    // New format: enc:<base64>
    if (encryptedText.startsWith('enc:')) {
        try {
            const key = getEncryptionKey();
            const combined = Buffer.from(encryptedText.slice(4), 'base64');

            const iv = combined.subarray(0, 16);
            const authTag = combined.subarray(16, 32);
            const ciphertext = combined.subarray(32);

            const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(ciphertext, undefined, 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (err) {
            console.error('[Decrypt-new] Error:', err.message);
            return '[Encrypted message]';
        }
    }

    // Legacy format: iv(hex):authTag(hex):ciphertext(hex)
    if (encryptedText.includes(':')) {
        try {
            const parts = encryptedText.split(':');
            if (parts.length >= 3) {
                const key = getEncryptionKey();
                const iv = Buffer.from(parts[0], 'hex');
                const authTag = Buffer.from(parts[1], 'hex');
                const ciphertext = parts.slice(2).join(':'); // rejoin in case ciphertext had colons
                const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
                decipher.setAuthTag(authTag);
                let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                return decrypted;
            }
        } catch (err) {
            console.error('[Decrypt-legacy] Error:', err.message);
            return '[Encrypted message]';
        }
    }

    // Not encrypted — return as-is (plain text)
    return encryptedText;
}

const messageSchema = mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'system'],
        default: 'text'
    },
    readBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
}, {
    timestamps: true
});

// NO pre-save hook — encryption is handled explicitly in the controller

// Index for fetching messages in a conversation, sorted by time
messageSchema.index({ conversationId: 1, createdAt: -1 });

// Index for unread count queries
messageSchema.index({ conversationId: 1, readBy: 1 });

// Export encrypt/decrypt as standalone module functions
const Message = mongoose.model('Message', messageSchema);
Message.encrypt = encrypt;
Message.decrypt = decrypt;

module.exports = Message;
