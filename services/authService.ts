import { GoogleAuthProvider, signInWithPopup, signOut, User } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { UsageData } from "../types";

const provider = new GoogleAuthProvider();

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

    try {
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        subscription: "free",
        usage: defaultUsage,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error creating user document:", error);
    }
  }
};

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    // --- ADD THIS ---
    await createUserDocument(result.user);
    // --- END ADD ---
  } catch (error) {
    console.error("Google sign-in error:", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Sign-out error:", error);
  }
};