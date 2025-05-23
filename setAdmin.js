const admin = require("firebase-admin");

// IMPORTANT: Download your service account key JSON file from
// Firebase Console > Project Settings > Service accounts
// Store it securely and DO NOT commit it to Git.
const serviceAccount = require("./path/to/your-service-account-key.json"); // Update path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const userEmailToMakeAdmin = "jasoncpumpkin247@gmail.com"; // << YOUR ADMIN EMAIL

admin.auth().getUserByEmail(userEmailToMakeAdmin)
  .then((userRecord) => {
    // See the UserRecord reference: https://firebase.google.com/docs/reference/admin/node/firebase-admin.auth.userrecord
    console.log(`Successfully fetched user data: ${userRecord.toJSON()}`);
    return admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
  })
  .then(() => {
    console.log(`Successfully set custom claim 'admin: true' for user ${userEmailToMakeAdmin}.`);
    console.log("User needs to log out and log back in for the claim to take effect on their ID token.");
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error setting custom claim:', error);
    process.exit(1);
  });
