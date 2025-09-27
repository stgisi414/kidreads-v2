// services/firestoreService.ts
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, limit } from "firebase/firestore";
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
  
  // Check if we need to make room for the new story
  const q = query(storiesRef, orderBy('id', 'desc'));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.docs.length >= MAX_STORIES) {
    // Delete the oldest story to make room
    const oldestStory = querySnapshot.docs[querySnapshot.docs.length - 1];
    await deleteDoc(oldestStory.ref);
  }

  // Save the new story, making sure not to save the large illustration data
  const storyToSave = { ...story, illustration: '' };
  const storyDocRef = doc(db, 'users', userId, STORIES_COLLECTION, story.id.toString());
  await setDoc(storyDocRef, storyToSave);
};

// Delete a specific story for a user
export const deleteStory = async (userId: string, storyId: number): Promise<void> => {
  const storyDocRef = doc(db, 'users', userId, STORIES_COLLECTION, storyId.toString());
  await deleteDoc(storyDocRef);
};

// Update an existing story (e.g., with quiz results)
export const updateStory = async (userId: string, story: Story): Promise<void> => {
    const storyToUpdate = { ...story, illustration: '' };
    const storyDocRef = doc(db, 'users', userId, STORIES_COLLECTION, story.id.toString());
    await setDoc(storyDocRef, storyToUpdate, { merge: true }); // Use merge to avoid overwriting other fields
};