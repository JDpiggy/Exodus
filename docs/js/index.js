const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK ONCE
try {
  admin.initializeApp();
} catch (e) {
  console.log("Admin SDK already initialized or error:", e.message);
}


// --- Callable Cloud Function to set a user as admin ---
// To call this, you'd use the Firebase SDK from a trusted client (e.g., a secure admin script/page)
// or call it directly via an HTTP request if you set it up as an HTTP function (requires more auth handling).
// For a one-time setup, you can even run a Node.js script locally using the Admin SDK.

exports.setUserAdminClaim = functions.https.onCall(async (data, context) => {
  // 1. Authentication Check: Ensure the caller is authenticated.
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  // 2. Authorization Check (IMPORTANT!):
  //    Ensure the CALLER has permission to make someone else an admin.
  //    For the first admin, you might have a special condition or do it via a local script.
  //    For subsequent admins, check if context.auth.token.admin === true.
  const callerUid = context.auth.uid;
  const callerIsAdmin = context.auth.token.admin === true; // Check if the CALLER is already an admin

  // Example: Only existing admins can make other users admins
  // (For initial setup, you'd need a different mechanism or a less restrictive rule temporarily)
  if (!callerIsAdmin && callerUid !== "YOUR_OWN_SUPER_ADMIN_UID_FOR_INITIAL_SETUP") { // Replace with your actual UID for first time
      console.log(`User ${callerUid} (not an admin) attempted to set admin claim for ${data.email}`);
      throw new functions.https.HttpsError(
          "permission-denied",
          "You do not have permission to perform this action."
      );
  }

  const targetUserEmail = data.email; // Email of the user to make an admin
  if (!targetUserEmail) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Please provide an email address."
    );
  }

  try {
    const userRecord = await admin.auth().getUserByEmail(targetUserEmail);
    if (userRecord.uid) {
      await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
      console.log(`Successfully set admin claim for ${targetUserEmail} (UID: ${userRecord.uid}) by ${callerUid}`);
      return {
        message: `Success! ${targetUserEmail} is now an admin. They may need to log out and log back in for changes to take effect.`,
      };
    } else {
      throw new functions.https.HttpsError("not-found", `User not found: ${targetUserEmail}`);
    }
  } catch (error) {
    console.error("Error setting admin claim for", targetUserEmail, ":", error);
    if (error.code === 'auth/user-not-found') {
        throw new functions.https.HttpsError("not-found", `User not found: ${targetUserEmail}`);
    }
    throw new functions.https.HttpsError("internal", "Unable to set admin claim. " + error.message);
  }
});

// --- (Optional) HTTP Function for one-time setup by a known admin/developer ---
// This is less secure for ongoing use than a callable function with proper auth.
// ONLY use this if you understand the security implications and secure it appropriately
// (e.g., with a secret key in the request, or by deleting it after use).
/*
exports.makeUserAdminHttp = functions.https.onRequest(async (req, res) => {
    // VERY IMPORTANT: Add strong authentication/authorization here if you use this.
    // For example, check for a secret key passed in headers or query params.
    // This is a simplified example and NOT production-ready without further security.
    const secretKey = req.query.key;
    if (secretKey !== "YOUR_VERY_SECRET_KEY_HERE") { // Replace with a real, strong secret
        console.warn("Unauthorized attempt to call makeUserAdminHttp");
        res.status(403).send("Unauthorized");
        return;
    }

    const email = req.query.email;
    if (!email) {
        res.status(400).send("Please provide an email query parameter.");
        return;
    }

    try {
        const user = await admin.auth().getUserByEmail(email);
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        res.send(`Successfully made ${email} (UID: ${user.uid}) an admin. User needs to re-login.`);
        console.log(`Successfully set admin claim for ${email} (UID: ${user.uid}) via HTTP by authorized request.`);
    } catch (error) {
        console.error("Error in makeUserAdminHttp:", error);
        res.status(500).send("Error setting admin claim: " + error.message);
    }
});
*/
