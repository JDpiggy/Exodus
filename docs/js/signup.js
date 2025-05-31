// docs/js/signup.js
document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof auth === 'undefined' || typeof db === 'undefined') {
        console.error("CRITICAL: Firebase services not available in signup.js.");
        const signupErrorMessage = document.getElementById('signupErrorMessage');
        if (signupErrorMessage) signupErrorMessage.textContent = "Initialization error. Please try again later.";
        return;
    }

    const signupForm = document.getElementById('signupForm');
    const displayNameInput = document.getElementById('displayName');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const signupErrorMessage = document.getElementById('signupErrorMessage');

    if (signupForm) {
        signupForm.addEventListener('submit', (event) => {
            event.preventDefault();
            if (signupErrorMessage) signupErrorMessage.textContent = '';

            const displayName = displayNameInput.value.trim();
            const email = emailInput.value;
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            if (!displayName) {
                if(signupErrorMessage) signupErrorMessage.textContent = "Display Name is required.";
                return;
            }
            if (password !== confirmPassword) {
                if(signupErrorMessage) signupErrorMessage.textContent = "Passwords do not match.";
                return;
            }
            if (password.length < 6) {
                if(signupErrorMessage) signupErrorMessage.textContent = "Password must be at least 6 characters long.";
                return;
            }

            auth.createUserWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    console.log("User created successfully:", user.uid);

                    // Now create a document in Firestore 'users' collection
                    return db.collection('users').doc(user.uid).set({
                        displayName: displayName,
                        email: user.email,
                        access: "pending", // New users start as pending
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                })
                .then(() => {
                    console.log("User profile created in Firestore with 'pending' access.");
                    // Optionally, update user's Firebase Auth profile with displayName
                    // return auth.currentUser.updateProfile({ displayName: displayName });
                    // For now, just inform the user
                    if(signupForm) signupForm.reset(); // Clear the form
                    if(signupErrorMessage) {
                        signupErrorMessage.textContent = "Account created! It is now awaiting admin approval. You will be redirected to login.";
                        signupErrorMessage.className = 'reset-message success'; // Use reset-message for consistent styling
                    }
                    // Redirect to login after a delay or let them click
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 4000);
                })
                .catch((error) => {
                    console.error("Error during sign up:", error);
                    if(signupErrorMessage) signupErrorMessage.textContent = "Signup Error: " + error.message;
                });
        });
    }
});
