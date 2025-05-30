// docs/js/auth.js

document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof auth === 'undefined' || typeof db === 'undefined') {
        console.error("CRITICAL: Firebase, auth, or db object is not available in auth.js. Check script loading order and firebase-config.js.");
        // alert("Firebase services not loaded correctly. Application might not work. Check console."); // Alert removed for cleaner experience, console error is key
        return;
    }

    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('errorMessage');
    const logoutBtn = document.getElementById('logoutBtn');

    // Function to get user role from Firestore
    function fetchAndSetUserAccessLevel(user) {
        if (!user) {
            localStorage.removeItem('exodusUserRole');
            localStorage.removeItem('exodusUserUID');
            return Promise.resolve(null);
        }

        console.log(`auth.js: Fetching access level for user UID: ${user.uid}`);
        const userDocRef = db.collection('users').doc(user.uid);
        return userDocRef.get()
            .then((doc) => {
                let accessLevel = 'viewer'; // Default to viewer
                if (doc.exists && doc.data() && doc.data().access) { // Check if doc.data() exists
                    accessLevel = doc.data().access; // "uploader" or "viewer"
                    console.log(`auth.js: User ${user.uid} access level from Firestore: ${accessLevel}`);
                } else {
                    console.warn(`auth.js: No user document or 'access' field found for UID ${user.uid} in Firestore. Defaulting to 'viewer'.`);
                    // Optional: Create a user document here if it doesn't exist with default "viewer" access on first login
                    // This is good practice for new users if you don't have a separate signup flow that creates this doc.
                    // userDocRef.set({ email: user.email, access: 'viewer', createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
                    //  .then(() => console.log(`auth.js: Created default user profile for ${user.uid}`))
                    //  .catch(err => console.error(`auth.js: Error creating default user profile:`, err));
                }
                localStorage.setItem('exodusUserRole', accessLevel);
                localStorage.setItem('exodusUserUID', user.uid);
                return accessLevel;
            })
            .catch((error) => {
                console.error("auth.js: Error fetching user document from Firestore:", error);
                localStorage.setItem('exodusUserRole', 'viewer'); // Fallback
                localStorage.setItem('exodusUserUID', user.uid);
                if (errorMessage) errorMessage.textContent = "Error fetching user role. Defaulting to viewer.";
                return 'viewer';
            });
    }

    // Handle Login
    if (loginForm) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!emailInput || !passwordInput) {
                console.error("auth.js: Email or password input field not found.");
                if(errorMessage) errorMessage.textContent = "Login form fields missing.";
                return;
            }
            const email = emailInput.value;
            const password = passwordInput.value;
            if(errorMessage) errorMessage.textContent = '';

            auth.signInWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    return fetchAndSetUserAccessLevel(user);
                })
                .then((accessLevel) => {
                    if (accessLevel) {
                        console.log("auth.js: User logged in with access level (role):", accessLevel);
                        window.location.href = 'index.html';
                    } else {
                        console.error("auth.js: Access level could not be determined after login.");
                        if(errorMessage) errorMessage.textContent = "Could not determine user role after login.";
                    }
                })
                .catch((error) => {
                    if(errorMessage) errorMessage.textContent = "Login failed: " + error.message;
                    console.error("auth.js: Login error:", error);
                });
        });
    }

    // Handle Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            auth.signOut().then(() => {
                localStorage.removeItem('exodusUserRole');
                localStorage.removeItem('exodusUserUID');
                window.location.href = 'login.html';
            }).catch((error) => {
                console.error("auth.js: Logout error:", error);
            });
        });
    }

    // Auth State Change Listener
    auth.onAuthStateChanged(user => {
        const currentPage = window.location.pathname.split("/").pop() || "index.html";
        const isLoggedIn = !!user;
        
        if (isLoggedIn) {
            fetchAndSetUserAccessLevel(user).then(accessLevel => {
                console.log("auth.js: Auth state changed, user signed in. Access level (role):", accessLevel, "Current page:", currentPage);
                if (currentPage === 'login.html') {
                    window.location.href = 'index.html';
                }
                // Dispatch a custom event to notify calendar.js that role might have been set/updated
                window.dispatchEvent(new CustomEvent('exodusUserRoleUpdated', { detail: { role: accessLevel } }));
            });
        } else {
            console.log("auth.js: Auth state changed, user signed out. Current page:", currentPage);
            localStorage.removeItem('exodusUserRole');
            localStorage.removeItem('exodusUserUID');
            if (currentPage !== 'login.html') {
                window.location.href = 'login.html';
            }
             // Dispatch a custom event to notify calendar.js that user logged out
            window.dispatchEvent(new CustomEvent('exodusUserRoleUpdated', { detail: { role: null } }));
        }
    });
});
