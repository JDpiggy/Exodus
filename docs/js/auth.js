// docs/js/auth.js

document.addEventListener('DOMContentLoaded', () => {
    // Check if Firebase services are globally available from firebase-config.js
    // 'auth' and 'db' should have been declared with 'var' in firebase-config.js to be accessible here,
    // or accessed as firebase.auth() and firebase.firestore() directly.
    if (typeof firebase === 'undefined' || typeof auth === 'undefined') {
        console.error("CRITICAL: Firebase or its 'auth' service is not available in auth.js. Check script loading order and firebase-config.js.");
        // Note: 'db' might not be needed on login.html if Firestore SDK isn't loaded there.
        // If an alert is desired:
        // alert("Firebase services not loaded correctly. Application might not work. Check console.");
        return; // Stop execution if Firebase auth is not ready
    }

    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('errorMessage'); // For login errors
    const logoutBtn = document.getElementById('logoutBtn'); // On index.html

    // --- Forgot Password Elements ---
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const resetMessage = document.getElementById('resetMessage'); // For reset status messages

    // Function to get user role from Firestore
    function fetchAndSetUserAccessLevel(user) {
        if (!user) {
            localStorage.removeItem('exodusUserRole');
            localStorage.removeItem('exodusUserUID');
            return Promise.resolve(null);
        }

        // Check if Firestore 'db' object is available. It might not be if login.html doesn't load firestore.js
        if (typeof db === 'undefined') {
            console.warn("auth.js: Firestore 'db' object is not available. Cannot fetch access level from Firestore. User role will not be set from DB here.");
            // Set UID at least, role can be fetched on calendar page if needed, or default.
            localStorage.setItem('exodusUserUID', user.uid);
            // If you are NOT using Custom Claims and RELY on Firestore for roles,
            // then the firestore.js SDK MUST be loaded on login.html too for this to work.
            // For now, we'll proceed, and calendar.js will use whatever role is in localStorage.
            return Promise.resolve(localStorage.getItem('exodusUserRole') || 'viewer'); // Return existing or default 'viewer'
        }


        console.log(`auth.js: Fetching access level for user UID: ${user.uid}`);
        const userDocRef = db.collection('users').doc(user.uid);
        return userDocRef.get()
            .then((doc) => {
                let accessLevel = 'viewer'; // Default to viewer
                if (doc.exists && doc.data() && doc.data().access) {
                    accessLevel = doc.data().access; // "uploader" or "viewer"
                    console.log(`auth.js: User ${user.uid} access level from Firestore: ${accessLevel}`);
                } else {
                    console.warn(`auth.js: No user document or 'access' field found for UID ${user.uid} in Firestore. Defaulting to 'viewer'.`);
                    // Optional: Create a user document here if it doesn't exist with default "viewer" access on first login
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
                if (errorMessage && errorMessage !== resetMessage) errorMessage.textContent = "Error fetching user role. Defaulting to viewer.";
                return 'viewer';
            });
    }


    // Handle Login
    if (loginForm) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!emailInput || !passwordInput) {
                console.error("auth.js: Email or password input field not found for login.");
                if(errorMessage) errorMessage.textContent = "Login form fields missing.";
                return;
            }
            const email = emailInput.value;
            const password = passwordInput.value;
            if(errorMessage) errorMessage.textContent = '';
            if(resetMessage) resetMessage.textContent = ''; // Clear reset messages on login attempt

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

    // Handle Forgot Password Link Click
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (event) => {
            event.preventDefault();
            if (!emailInput) {
                console.error("auth.js: Email input field not found for password reset.");
                if(resetMessage) {
                    resetMessage.textContent = 'Email field is missing.';
                    resetMessage.className = 'reset-message error';
                }
                return;
            }

            const email = emailInput.value;

            if (!email) {
                if(resetMessage) {
                    resetMessage.textContent = 'Please enter your email address above to reset password.';
                    resetMessage.className = 'reset-message error';
                }
                emailInput.focus();
                return;
            }

            if(errorMessage) errorMessage.textContent = ''; // Clear login errors
            if(resetMessage) {
                 resetMessage.textContent = 'Sending reset email...';
                 resetMessage.className = 'reset-message'; // Default class, no error/success yet
            }

            auth.sendPasswordResetEmail(email)
                .then(() => {
                    if(resetMessage) {
                        resetMessage.textContent = 'Password reset email sent! Check your inbox (and spam folder).';
                        resetMessage.className = 'reset-message success';
                    }
                    console.log("Password reset email sent to:", email);
                })
                .catch((error) => {
                    if(resetMessage) {
                        // Firebase provides user-friendly error messages for common cases like 'auth/user-not-found'
                        resetMessage.textContent = 'Error: ' + error.message;
                        resetMessage.className = 'reset-message error';
                    }
                    console.error("Error sending password reset email:", error);
                });
        });
    }
});
