// services/authService.ts

import { GoogleAuthProvider, signInWithPopup, signOut, User } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { UsageData, SubscriptionStatus } from "../types"; // <-- Import SubscriptionStatus

const provider = new GoogleAuthProvider();

// --- ADD THIS: List of admin emails ---
const ADMIN_EMAILS = [
  //"stefdgisi@gmail.com"
  // Add any other admin emails here
];
// --- END ADD ---

// Function to create a user document in Firestore on first login
const createUserDocument = async (user: User) => {
  const userRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(userRef);

  if (!docSnap.exists()) {
    // User is new
    const defaultUsage: UsageData = {
      credits: 5,
      lastReset: new Date(0).getTime(), // Set to epoch to force reset on first use
    };

    // --- ADD THIS: Check if user is an admin ---
    const isAdmin = user.email ? ADMIN_EMAILS.includes(user.email) : false;
    let subscriptionType: SubscriptionStatus = "free";
    let usageData = defaultUsage;

    if (isAdmin) {
      subscriptionType = "admin"; // Use a custom status or keep 'free' and add an isAdmin flag
      // Admins get effectively unlimited credits, represented by a high number or -1
      usageData = {
        credits: -1, // -1 can signify unlimited
        lastReset: new Date().getTime(),
      };
      console.log(`Admin user detected: ${user.email}`); // Log admin creation
    }
    // --- END ADD ---

    try {
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        subscription: subscriptionType,
        usage: usageData,
        createdAt: serverTimestamp(),
        isAdmin: isAdmin,
      });
      console.log(`User document created for ${user.email}, isAdmin: ${isAdmin}`);
    } catch (error) {
      console.error("Error creating user document:", error);
    }
  } else {
    console.log(`User document already exists for ${user.email}`);
    // Optional: Check if an existing user should be upgraded to admin
    const userData = docSnap.data();
    const isAdmin = user.email ? ADMIN_EMAILS.includes(user.email) : false;
    if (isAdmin && userData.subscription !== 'admin' && !userData.isAdmin) {
        try {
            await setDoc(userRef, {
                subscription: "admin",
                isAdmin: true,
                usage: { credits: -1, lastReset: new Date().getTime() }
            }, { merge: true });
            console.log(`Existing user ${user.email} updated to admin.`);
        } catch (error) {
            console.error("Error updating existing user to admin:", error);
        }
    }
  }
};

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    await createUserDocument(result.user); // createUserDocument now handles admin logic
  } catch (error) {
    console.error("Google sign-in error:", error);
    throw error; // Re-throw the error for potential handling upstream
  }
};


export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Sign-out error:", error);
  }
};