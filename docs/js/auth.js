document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('errorMessage');
    const logoutBtn = document.getElementById('logoutBtn');

    // ADMIN_EMAIL_IDENTIFIER is REMOVED from here. Role is determined by custom claims.

    // Function to set user role based on custom claims
    function setUserRoleFromClaims(user) {
        return user.getIdTokenResult(true) // Force refresh to get latest claims
            .then((idTokenResult) => {
                if (idTokenResult.claims.admin === true) { // Check for the 'admin' claim
                    localStorage.setItem('exodusUserRole', 'admin');
                } else {
                    localStorage.setItem('exodusUserRole', 'viewer');
                }
                localStorage.setItem('exodusUserUID', user.uid);
                return localStorage.getItem('exodusUserRole'); // Return the determined role
            })
            .catch((error) => {
                console.error("Error getting ID token result / custom claims:", error);
                // Fallback to viewer role in case of error fetching claims
                localStorage.setItem('exodusUserRole', 'viewer');
                localStorage.setItem('exodusUserUID', user.uid); // Still set UID
                if (errorMessage) errorMessage.textContent = "Error verifying user role. Defaulting to viewer.";
                return 'viewer'; // Return fallback role
            });
    }

    // Handle Login
    if (loginForm) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const email = emailInput.value;
            const password = passwordInput.value;
            if(errorMessage) errorMessage.textContent = '';

            auth.signInWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    return setUserRoleFromClaims(user); // Get role from claims
                })
                .then((role) => { // Role is now determined
                    console.log("User logged in with role:", role);
                    window.location.href = 'index.html';
                })
                .catch((error) => {
                    if(errorMessage) errorMessage.textContent = "Login failed: " + error.message;
                    console.error("Login error:", error);
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
                console.error("Logout error:", error);
            });
        });
    }

    // Auth State Change Listener
    auth.onAuthStateChanged(user => {
        const currentPage = window.location.pathname.split("/").pop();
        const isLoggedIn = !!user;
        
        if (isLoggedIn) {
            // User is signed in. Set role from claims.
            setUserRoleFromClaims(user).then(role => {
                console.log("Auth state changed, user signed in with role:", role);
                if (currentPage === 'login.html' || currentPage === '') {
                    window.location.href = 'index.html';
                }
                // You might want to refresh calendar.js if role changes affect UI elements shown immediately
                // For example, by dispatching a custom event that calendar.js listens for.
            });
        } else {
            // User is signed out.
            localStorage.removeItem('exodusUserRole');
            localStorage.removeItem('exodusUserUID');
            if (currentPage !== 'login.html' && currentPage !== '') {
                window.location.href = 'login.html';
            }
        }
    });
});
