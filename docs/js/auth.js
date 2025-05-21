// docs/js/auth.js

document.addEventListener('DOMContentLoaded', () => {
    // Ensure Firebase and auth object are available.
    // 'auth' should be globally defined by firebase-config.js or available as firebase.auth()
    if (typeof firebase === 'undefined' || typeof auth === 'undefined') {
        console.error("CRITICAL: Firebase or auth object is not available in auth.js. Check script loading order and firebase-config.js.");
        alert("Firebase services not loaded correctly. Application might not work. Check console.");
        return; // Stop execution if Firebase auth is not ready
    }

    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('errorMessage');
    const logoutBtn = document.getElementById('logoutBtn'); // On index.html

    // Function to set user role based on custom claims
    function setUserRoleFromClaims(user) {
        if (!user) {
            localStorage.removeItem('exodusUserRole');
            localStorage.removeItem('exodusUserUID');
            return Promise.resolve(null); // Or reject, depending on desired handling
        }
        return user.getIdTokenResult(true) // Force refresh to get latest claims
            .then((idTokenResult) => {
                if (idTokenResult.claims.admin === true) {
                    localStorage.setItem('exodusUserRole', 'admin');
                } else {
                    localStorage.setItem('exodusUserRole', 'viewer');
                }
                localStorage.setItem('exodusUserUID', user.uid);
                console.log("User role set from claims:", localStorage.getItem('exodusUserRole'));
                return localStorage.getItem('exodusUserRole');
            })
            .catch((error) => {
                console.error("Error getting ID token result / custom claims in auth.js:", error);
                localStorage.setItem('exodusUserRole', 'viewer'); // Fallback to viewer
                localStorage.setItem('exodusUserUID', user.uid);
                if (errorMessage) errorMessage.textContent = "Error verifying user role. Defaulting to viewer.";
                return 'viewer';
            });
    }

    // Handle Login
    if (loginForm) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!emailInput || !passwordInput) {
                console.error("Email or password input field not found.");
                if(errorMessage) errorMessage.textContent = "Login form fields missing.";
                return;
            }
            const email = emailInput.value;
            const password = passwordInput.value;
            if(errorMessage) errorMessage.textContent = '';

            auth.signInWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    return setUserRoleFromClaims(user);
                })
                .then((role) => {
                    if (role) { // Ensure role was successfully determined
                        console.log("User logged in with role:", role);
                        window.location.href = 'index.html';
                    } else {
                        // This case should ideally be handled within setUserRoleFromClaims error
                        console.error("Role could not be determined after login.");
                        if(errorMessage) errorMessage.textContent = "Could not determine user role after login.";
                    }
                })
                .catch((error) => {
                    if(errorMessage) errorMessage.textContent = "Login failed: " + error.message;
                    console.error("Login error in auth.js:", error);
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
                console.error("Logout error in auth.js:", error);
            });
        });
    }

    // Auth State Change Listener
    auth.onAuthStateChanged(user => {
        const currentPage = window.location.pathname.split("/").pop() || "index.html"; // Default to index if path is just '/'
        const isLoggedIn = !!user;
        
        if (isLoggedIn) {
            setUserRoleFromClaims(user).then(role => {
                console.log("Auth state changed, user signed in. Role:", role, "Current page:", currentPage);
                if (currentPage === 'login.html') {
                    window.location.href = 'index.html';
                }
                // If role is critical for immediate UI changes on other pages,
                // you might dispatch an event here that calendar.js can listen to.
            });
        } else {
            console.log("Auth state changed, user signed out. Current page:", currentPage);
            localStorage.removeItem('exodusUserRole');
            localStorage.removeItem('exodusUserUID');
            if (currentPage !== 'login.html') {
                window.location.href = 'login.html';
            }
        }
    });
});
