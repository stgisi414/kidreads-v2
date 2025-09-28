// services/firestoreService.ts
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import type { Story } from '../types';

const STORIES_COLLECTION = 'stories';
const MAX_STORIES = 10;

// Get all saved stories for a specific user
export const getSavedStories = async (userId: string): Promise<Story[]> => {
  const storiesRef = collection(db, 'users', userId, STORIES_COLLECTION);
  const q = query(storiesRef, orderBy('id', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as Story);
};

// Save a story for a user, respecting the 10-story limit
export const saveStory = async (userId: string, story: Story): Promise<void> => {
  const storiesRef = collection(db, 'users', userId, STORIES_COLLECTION);
  
  const q = query(storiesRef, orderBy('id', 'desc'));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.docs.length >= MAX_STORIES) {
    const oldestStory = querySnapshot.docs[querySnapshot.docs.length - 1];
    await deleteDoc(oldestStory.ref);
  }

  // Save the complete story object, including the illustration
  const storyDocRef = doc(db, 'users', userId, STORIES_COLLECTION, story.id.toString());
  await setDoc(storyDocRef, story);
};

// Delete a specific story for a user
export const deleteStory = async (userId: string, storyId: number): Promise<void> => {
  const storyDocRef = doc(db, 'users', userId, STORIES_COLLECTION, storyId.toString());
  await deleteDoc(storyDocRef);
};

// Update an existing story (e.g., with quiz results)
export const updateStory = async (userId: string, story: Story): Promise<void> => {
    const storyDocRef = doc(db, 'users', userId, STORIES_COLLECTION, story.id.toString());
    // Use merge to avoid overwriting and save the full story object
    await setDoc(storyDocRef, story, { merge: true });
};

// Get user preferences (like selected voice)
export const getUserPreferences = async (userId: string): Promise<{ voice?: string }> => {
  const userDocRef = doc(db, 'users', userId);
  const docSnap = await getDoc(userDocRef);
  if (docSnap.exists()) {
    // Preferences are stored in a 'preferences' field in the user's document
    return docSnap.data().preferences || {};
  }
  return {};
};

// Update user preferences
export const updateUserPreferences = async (userId: string, preferences: { voice: string }): Promise<void> => {
  const userDocRef = doc(db, 'users', userId);
  // We use { merge: true } to avoid overwriting other user data
  await setDoc(userDocRef, { preferences }, { merge: true });
};