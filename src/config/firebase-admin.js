const admin = require('firebase-admin');

if (!admin.apps.length) {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Handle both formats:
  // 1. Render multiline (actual line breaks) — already correct
  // 2. .env single line with \n literal — needs replacement
  if (privateKey && !privateKey.includes('\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  // Remove any surrounding quotes if present
  privateKey = privateKey?.replace(/^"|"$/g, '');

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey
    })
  });
}

module.exports = admin;