// services/firestoreService.ts
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, getDoc, runTransaction, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import type { Story, SubscriptionStatus, UserData } from '../types';

const STORIES_COLLECTION = 'stories';
const USERS_COLLECTION = 'users';
const MAX_STORIES = 10;

// Get all saved stories for a specific user
export const getSavedStories = async (userId: string): Promise<Story[]> => {
  const storiesRef = collection(db, USERS_COLLECTION, userId, STORIES_COLLECTION);
  const q = query(storiesRef, orderBy('id', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as Story);
};

// Save a story for a user, respecting the 10-story limit
export const saveStory = async (userId: string, story: Story): Promise<void> => {
  const storiesRef = collection(db, USERS_COLLECTION, userId, STORIES_COLLECTION);
  
  const q = query(storiesRef, orderBy('id', 'desc'));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.docs.length >= MAX_STORIES) {
    const oldestStory = querySnapshot.docs[querySnapshot.docs.length - 1];
    await deleteDoc(oldestStory.ref);
  }

  const storyDocRef = doc(db, USERS_COLLECTION, userId, STORIES_COLLECTION, story.id.toString());
  await setDoc(storyDocRef, story);
};

// Delete a specific story for a user
export const deleteStory = async (userId: string, storyId: number): Promise<void> => {
  const storyDocRef = doc(db, USERS_COLLECTION, userId, STORIES_COLLECTION, storyId.toString());
  await deleteDoc(storyDocRef);
};

// Update an existing story (e.g., with quiz results)
export const updateStory = async (userId: string, story: Story): Promise<void> => {
    const storyDocRef = doc(db, USERS_COLLECTION, userId, STORIES_COLLECTION, story.id.toString());
    await setDoc(storyDocRef, story, { merge: true });
};

// Get user preferences (like selected voice)
export const getUserPreferences = async (userId: string): Promise<{ voice?: string; speakingRate?: number; storyLength?: number }> => {
  const userDocRef = doc(db, USERS_COLLECTION, userId);
  try {
      const docSnap = await getDoc(userDocRef);
      // --- MODIFICATION START ---
      if (docSnap.exists()) {
          const data = docSnap.data();
          // Check if data and preferences exist before returning
          return data?.preferences || {}; // Return preferences if it exists, otherwise empty object
      } else {
          console.log(`No user document found for ${userId} when getting preferences.`); // Log if doc doesn't exist
          return {}; // Return empty object if document doesn't exist
      }
      // --- MODIFICATION END ---
  } catch (error) {
      console.error(`Error fetching preferences for user ${userId}:`, error);
      return {}; // Return empty object on error
  }
};

// Update user preferences
export const updateUserPreferences = async (userId: string, preferences: { voice?: string; speakingRate?: number; storyLength?: number }): Promise<void> => {
  const userDocRef = doc(db, USERS_COLLECTION, userId);
  try {
      // Use updateDoc for potentially existing docs, merge ensures we don't overwrite other fields
      await setDoc(userDocRef, { preferences }, { merge: true });
  } catch (error) {
       console.error(`Error updating preferences for user ${userId}:`, error);
       // Decide if you want to re-throw or handle the error silently
  }
};


// --- ADD NEW FUNCTION ---

const getCreditsForSubscription = (subscription: SubscriptionStatus): number => {
  switch (subscription) {
    case 'admin': // <-- ADD THIS CASE
      return -1; // Unlimited
    case 'lite':
      return 10;
    case 'max':
      return 25;
    case 'free':
    default:
      return 5;
  }
};

export const checkAndDecrementCredits = async (
  userId: string,
  creditsToDeduct: number,
): Promise<boolean> => {
  const userRef = doc(db, USERS_COLLECTION, userId);

  try {
    let isAdmin = false; // Flag to track admin status

    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists()) {
        throw new Error("User document does not exist!");
      }

      const userData = userDoc.data() as UserData; // <-- Cast to UserData
      const subscription = userData.subscription || 'free';
      isAdmin = userData.isAdmin || subscription === 'admin'; // Check both flag and subscription string

      if (isAdmin) {
        console.log(`Admin user ${userId} bypassed credit check.`);
        // No need to update credits for admins, just proceed
        return; // Exit the transaction function successfully
      }

      let currentCredits = userData.usage?.credits ?? 0;
      const lastReset = userData.usage?.lastReset ?? 0;

      const now = Date.now();
      const lastResetDate = new Date(lastReset);
      const nowDate = new Date(now);

      // Check if it's a new day (UTC)
      if (
        lastResetDate.getUTCFullYear() !== nowDate.getUTCFullYear() ||
        lastResetDate.getUTCMonth() !== nowDate.getUTCMonth() ||
        lastResetDate.getUTCDate() !== nowDate.getUTCDate()
      ) {
        // New day, reset credits based on subscription fetched from the document
        currentCredits = getCreditsForSubscription(subscription);

        if (currentCredits >= creditsToDeduct) {
          // Has enough credits after reset
          transaction.update(userRef, {
            "usage.credits": currentCredits - creditsToDeduct,
            "usage.lastReset": now,
          });
        } else {
          // Not enough credits even after reset
           transaction.update(userRef, {
            "usage.credits": currentCredits, // Update credits even if insufficient
            "usage.lastReset": now,          // Update lastReset
          });
          throw new Error("Not enough credits for this action after daily reset.");
        }
      } else {
        // Same day, just check credits
        if (currentCredits >= creditsToDeduct) {
          // Has enough credits
          transaction.update(userRef, {
            "usage.credits": currentCredits - creditsToDeduct,
          });
        } else {
          // Not enough credits
          throw new Error("Not enough credits for this action.");
        }
      }
    });

    // Transaction was successful (or bypassed for admin)
    return true;
  } catch (error: any) {
    console.error("Credit check/decrement transaction failed:", error.message);
    // Transaction failed (e.g., not enough credits or other error)
    return false;
  }
};