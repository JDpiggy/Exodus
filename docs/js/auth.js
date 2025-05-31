// docs/js/auth.js

document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof auth === 'undefined' || typeof db === 'undefined') {
        console.error("CRITICAL: Firebase, auth, or db object is not available in auth.js. Check script loading order and firebase-config.js.");
        return;
    }

    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('errorMessage');
    const logoutBtn = document.getElementById('logoutBtn');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const resetMessage = document.getElementById('resetMessage');

    function fetchAndSetUserAccessLevel(user) {
        if (!user) {
            localStorage.removeItem('exodusUserRole');
            localStorage.removeItem('exodusUserUID');
            localStorage.removeItem('userDisplayName'); // Clear display name too
            return Promise.resolve(null);
        }

        console.log(`auth.js: Fetching access level for user UID: ${user.uid}`);
        const userDocRef = db.collection('users').doc(user.uid);
        return userDocRef.get()
            .then((doc) => {
                let accessLevel = 'viewer';
                let accountStatusMessage = null;
                let displayName = user.email.split('@')[0]; // Default display name

                if (doc.exists && doc.data()) {
                    const userData = doc.data();
                    if (userData.displayName) {
                        displayName = userData.displayName;
                    }
                    if (userData.access === "pending") {
                        console.warn(`auth.js: Account for UID ${user.uid} is PENDING APPROVAL.`);
                        accessLevel = "pending";
                        accountStatusMessage = "Your account is awaiting admin approval. Please check back later.";
                    } else if (userData.access) {
                        accessLevel = userData.access;
                        console.log(`auth.js: User ${user.uid} access level from Firestore: ${accessLevel}`);
                    } else {
                        console.warn(`auth.js: 'access' field missing for UID ${user.uid}. Defaulting to 'viewer'.`);
                        // Consider creating/updating user doc with default 'viewer' if missing access
                        // db.collection('users').doc(user.uid).set({ access: 'viewer', email: user.email, displayName: displayName }, { merge: true });
                    }
                } else {
                    console.warn(`auth.js: No user document found for UID ${user.uid}. New user or error. Defaulting to 'viewer' locally.`);
                    // Optional: Create a user document here if it doesn't exist on first login
                    // db.collection('users').doc(user.uid).set({ email: user.email, displayName: displayName, access: 'viewer', createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
                }

                localStorage.setItem('userDisplayName', displayName); // Store display name

                if (accessLevel === "pending") {
                    localStorage.removeItem('exodusUserRole');
                    localStorage.setItem('exodusUserUID', user.uid); // Store UID for reference
                    const pendingError = new Error(accountStatusMessage || "Account pending approval.");
                    pendingError.code = "auth/account-pending-approval";
                    throw pendingError;
                } else {
                    localStorage.setItem('exodusUserRole', accessLevel);
                    localStorage.setItem('exodusUserUID', user.uid);
                    return accessLevel;
                }
            })
            .catch((error) => {
                // If it's our custom pending error, rethrow it to be caught by login handler
                if (error.code === "auth/account-pending-approval") {
                    throw error;
                }
                console.error("auth.js: Error fetching user document from Firestore:", error);
                localStorage.setItem('exodusUserRole', 'viewer'); // Fallback
                localStorage.setItem('exodusUserUID', user.uid); // Still set UID
                localStorage.setItem('userDisplayName', user.email.split('@')[0]); // Fallback display name
                if (errorMessage && errorMessage !== resetMessage) errorMessage.textContent = "Error fetching user role. Defaulting to viewer.";
                return 'viewer'; // Resolve with 'viewer' on other errors
            });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!emailInput || !passwordInput) { /* ... */ return; }
            const email = emailInput.value;
            const password = passwordInput.value;
            if(errorMessage) errorMessage.textContent = '';
            if(resetMessage) resetMessage.textContent = '';

            auth.signInWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    return fetchAndSetUserAccessLevel(user);
                })
                .then((accessLevel) => {
                    if (accessLevel && accessLevel !== "pending") { // Ensure not pending
                        console.log("auth.js: User logged in with access level (role):", accessLevel);
                        window.location.href = 'index.html';
                    } else if (accessLevel === "pending") {
                        // This case should be handled by the error thrown in fetchAndSetUserAccessLevel
                        console.warn("auth.js: Login attempted with pending account, error should have been caught.");
                         if(errorMessage) errorMessage.textContent = "Your account is awaiting admin approval.";
                    } else {
                        console.error("auth.js: Access level could not be determined after login.");
                        if(errorMessage) errorMessage.textContent = "Could not determine user role after login.";
                    }
                })
                .catch((error) => {
                    if (error.code === "auth/account-pending-approval") {
                        if(errorMessage) errorMessage.textContent = error.message;
                    } else {
                        if(errorMessage) errorMessage.textContent = "Login failed: " + error.message;
                    }
                    console.error("auth.js: Login error/status:", error);
                });
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            auth.signOut().then(() => {
                localStorage.removeItem('exodusUserRole');
                localStorage.removeItem('exodusUserUID');
                localStorage.removeItem('userDisplayName'); // Clear display name
                window.location.href = 'login.html';
            }).catch((error) => {
                console.error("auth.js: Logout error:", error);
            });
        });
    }

    auth.onAuthStateChanged(user => {
        const currentPage = window.location.pathname.split("/").pop() || "index.html";
        const isLoggedIn = !!user;
        
        if (isLoggedIn) {
            fetchAndSetUserAccessLevel(user).then(accessLevel => {
                console.log("auth.js: Auth state changed, user signed in. Access level (role):", accessLevel, "Current page:", currentPage);
                if (accessLevel === "pending" && currentPage !== 'login.html') {
                    // If on calendar page but account becomes pending (e.g. admin revokes), log out and show message
                    auth.signOut().then(() => {
                        localStorage.removeItem('exodusUserRole');
                        localStorage.removeItem('exodusUserUID');
                        localStorage.removeItem('userDisplayName');
                        alert("Your account access has been set to pending. Please contact an administrator.");
                        window.location.href = 'login.html';
                    });
                    return;
                }

                if (currentPage === 'login.html' && accessLevel !== "pending") {
                    window.location.href = 'index.html';
                }
                window.dispatchEvent(new CustomEvent('exodusUserRoleUpdated', { detail: { role: accessLevel } }));
            }).catch(error => { // Catch pending error from fetchAndSetUserAccessLevel
                 if (error.code === "auth/account-pending-approval" && currentPage !== 'login.html') {
                    // If directly navigating to index.html with a pending account, redirect to login to show message
                     window.location.href = 'login.html'; // Login page will show the "pending" message
                 } else if (error.code === "auth/account-pending-approval" && currentPage === 'login.html') {
                     if(errorMessage) errorMessage.textContent = error.message;
                 }
                 console.log("auth.js: Auth state changed, but account is pending or error fetching role.");
            });
        } else {
            console.log("auth.js: Auth state changed, user signed out. Current page:", currentPage);
            localStorage.removeItem('exodusUserRole');
            localStorage.removeItem('exodusUserUID');
            localStorage.removeItem('userDisplayName');
            if (currentPage !== 'login.html' && currentPage !== 'signup.html') { // Don't redirect if already on login/signup
                window.location.href = 'login.html';
            }
            window.dispatchEvent(new CustomEvent('exodusUserRoleUpdated', { detail: { role: null } }));
        }
    });

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (event) => {
            event.preventDefault();
            if (!emailInput) { /* ... */ return; }
            const email = emailInput.value;
            if (!email) { /* ... set resetMessage ... */ return; }
            if(errorMessage) errorMessage.textContent = '';
            if(resetMessage) { resetMessage.textContent = 'Sending reset email...'; resetMessage.className = 'reset-message';}

            auth.sendPasswordResetEmail(email)
                .then(() => { /* ... set success resetMessage ... */ 
                    if(resetMessage) {
                        resetMessage.textContent = 'Password reset email sent! Check your inbox (and spam folder).';
                        resetMessage.className = 'reset-message success';
                    }
                })
                .catch((error) => { /* ... set error resetMessage ... */ 
                     if(resetMessage) {
                        resetMessage.textContent = 'Error: ' + error.message;
                        resetMessage.className = 'reset-message error';
                    }
                });
        });
    }
});
