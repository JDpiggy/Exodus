document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('errorMessage');
    const logoutBtn = document.getElementById('logoutBtn'); // On index.html

    // --- IMPORTANT: CONFIGURE THIS ---
    // This is the email you registered in Firebase Authentication for the Admin role.
    const ADMIN_EMAIL_IDENTIFIER = "YOUR_ADMIN_EMAIL_HERE"; // e.g., "admin@exoduscalendar.app"

    if (!ADMIN_EMAIL_IDENTIFIER || ADMIN_EMAIL_IDENTIFIER === "YOUR_ADMIN_EMAIL_HERE") {
        console.error("CRITICAL: ADMIN_EMAIL_IDENTIFIER is not configured in public/js/auth.js!");
        if (errorMessage) errorMessage.textContent = "Admin email not configured. Please contact support.";
    }


    // Handle Login
    if (loginForm) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const email = emailInput.value;
            const password = passwordInput.value;
            if(errorMessage) errorMessage.textContent = ''; // Clear previous errors

            auth.signInWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    if (user.email === ADMIN_EMAIL_IDENTIFIER) {
                        localStorage.setItem('exodusUserRole', 'admin');
                    } else {
                        localStorage.setItem('exodusUserRole', 'viewer');
                    }
                    localStorage.setItem('exodusUserUID', user.uid);
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
                // Optionally display an error to the user
            });
        });
    }

    // Auth State Change Listener (handles redirects and session persistence)
    auth.onAuthStateChanged(user => {
        const currentPage = window.location.pathname.split("/").pop(); // Gets the current HTML file name
        const isLoggedIn = !!user; // True if user object exists, false otherwise
        
        if (isLoggedIn) {
            // User is signed in.
            // Ensure role is set if not already (e.g., direct navigation after login)
            if (!localStorage.getItem('exodusUserRole') || localStorage.getItem('exodusUserUID') !== user.uid) {
                if (user.email === ADMIN_EMAIL_IDENTIFIER) {
                    localStorage.setItem('exodusUserRole', 'admin');
                } else {
                    localStorage.setItem('exodusUserRole', 'viewer');
                }
                localStorage.setItem('exodusUserUID', user.uid);
            }

            if (currentPage === 'login.html' || currentPage === '') {
                // If on login page (or root which might redirect to login) and signed in, go to calendar
                window.location.href = 'index.html';
            }
        } else {
            // User is signed out.
            localStorage.removeItem('exodusUserRole');
            localStorage.removeItem('exodusUserUID');
            if (currentPage !== 'login.html' && currentPage !== '') {
                // If not on login page and not signed in, redirect to login
                window.location.href = 'login.html';
            }
        }
    });
});
