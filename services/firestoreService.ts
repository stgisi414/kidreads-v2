// services/firestoreService.ts
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, getDoc, runTransaction, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import type { Story, SubscriptionStatus } from '../types';

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
  const docSnap = await getDoc(userDocRef);
  if (docSnap.exists()) {
    // Preferences are now nested
    return docSnap.data().preferences || {};
  }
  return {};
};

// Update user preferences
export const updateUserPreferences = async (userId: string, preferences: { voice?: string; speakingRate?: number; storyLength?: number }): Promise<void> => {
  const userDocRef = doc(db, USERS_COLLECTION, userId);
  // Merge with the top-level user document
  await setDoc(userDocRef, { preferences }, { merge: true });
};


// --- ADD NEW FUNCTION ---

const getCreditsForSubscription = (subscription: SubscriptionStatus): number => {
  switch (subscription) {
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
  subscription: SubscriptionStatus
): Promise<boolean> => {
  const userRef = doc(db, USERS_COLLECTION, userId);

  try {
    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists()) {
        throw new Error("User document does not exist!");
      }

      const userData = userDoc.data();
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
        // New day, reset credits
        currentCredits = getCreditsForSubscription(subscription);
        
        if (currentCredits >= creditsToDeduct) {
          // Has enough credits after reset
          transaction.update(userRef, {
            "usage.credits": currentCredits - creditsToDeduct,
            "usage.lastReset": now,
          });
        } else {
          // Not enough credits even after reset (e.g., free user trying epic story)
           transaction.update(userRef, {
            "usage.credits": currentCredits,
            "usage.lastReset": now,
          });
          throw new Error("Not enough credits for this action.");
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

    // Transaction was successful
    return true;
  } catch (error: any) {
    console.error("Credit check transaction failed:", error.message);
    // Transaction failed (e.g., not enough credits)
    return false;
  }
};