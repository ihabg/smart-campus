const admin = require('firebase-admin');

let firebaseApp = null;

/**
 * Initialise Firebase Admin SDK once.
 * Called on server startup only if credentials are present.
 */
function initFirebase() {
  if (firebaseApp) return firebaseApp;

  const { FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_PRIVATE_KEY || !FIREBASE_CLIENT_EMAIL) {
    console.warn('⚠️  Firebase credentials not configured — push notifications disabled');
    return null;
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   FIREBASE_PROJECT_ID,
        privateKey:  FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: FIREBASE_CLIENT_EMAIL,
      }),
    });
    console.log('🔥 Firebase Admin SDK initialised');
    return firebaseApp;
  } catch (error) {
    console.error('❌ Firebase init failed:', error.message);
    return null;
  }
}

/**
 * Send a push notification to a single device token.
 * @param {string} token   - FCM device token
 * @param {string} title   - notification title
 * @param {string} body    - notification body
 * @param {Object} data    - optional key-value payload
 * @returns {Promise<string|null>} message ID or null
 */
async function sendToDevice(token, title, body, data = {}) {
  if (!firebaseApp) return null;

  const message = {
    token,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    android: {
      priority: 'high',
      notification: { sound: 'default', channelId: 'campus_alerts' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    return response;
  } catch (error) {
    console.error(`FCM send failed for token ${token.slice(0, 20)}…:`, error.message);
    return null;
  }
}

/**
 * Send a notification to multiple device tokens (multicast).
 * @param {string[]} tokens - array of FCM device tokens
 * @param {string}   title
 * @param {string}   body
 * @param {Object}   data
 * @returns {Promise<Object>} batch response
 */
async function sendToMultiple(tokens, title, body, data = {}) {
  if (!firebaseApp || !tokens.length) return { successCount: 0, failureCount: 0 };

  const message = {
    tokens,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
    android: {
      priority: 'high',
      notification: { sound: 'default', channelId: 'campus_alerts' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`FCM multicast: ${response.successCount} sent, ${response.failureCount} failed`);
    return response;
  } catch (error) {
    console.error('FCM multicast failed:', error.message);
    return { successCount: 0, failureCount: tokens.length };
  }
}

/**
 * Send notification to a topic (e.g. 'all_students', 'floor_7').
 */
async function sendToTopic(topic, title, body, data = {}) {
  if (!firebaseApp) return null;

  const message = {
    topic,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ),
  };

  try {
    return await admin.messaging().send(message);
  } catch (error) {
    console.error(`FCM topic send failed (${topic}):`, error.message);
    return null;
  }
}

module.exports = { initFirebase, sendToDevice, sendToMultiple, sendToTopic };
