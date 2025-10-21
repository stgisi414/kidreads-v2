import {
  collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, getDoc, runTransaction, Timestamp, updateDoc,
  // NEW: Import necessary query functions
  where, limit
} from "firebase/firestore";
import { db } from "../firebase";
import type { Story, SubscriptionStatus, UserData, UsageData } from '../types'; // <-- Added UsageData

const STORIES_COLLECTION = 'stories';
const USERS_COLLECTION = 'users';
const CLASSROOMS_COLLECTION = 'classrooms'; // New constant
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

// --- UPDATED HELPER FUNCTION ---
const getCreditsForSubscription = (subscription: SubscriptionStatus, isTeacher: boolean = false): number => {
  switch (subscription) {
    case 'admin':
      return -1; // Unlimited
    case 'classroom': // <-- ADD THIS CASE
      return isTeacher ? 30 : 10; // Teacher gets 30, student gets 10
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
  userEmail: string | null // <-- Need user's email now
): Promise<boolean> => {
  const userRef = doc(db, USERS_COLLECTION, userId);
  const classroomsRef = collection(db, CLASSROOMS_COLLECTION);

  try {
    let isTeacherInClassroom = false;
    let isStudentInClassroom = false;
    let classroomSubscriptionStatus: SubscriptionStatus | null = null;
    let classroomDocId: string | null = null; // Store the classroom ID if found

    // 1. Check if user is a teacher of an active classroom
    const teacherQuery = query(classroomsRef, where("teacherUid", "==", userId), limit(1));
    const teacherSnap = await getDocs(teacherQuery);
    if (!teacherSnap.empty) {
      const classroomData = teacherSnap.docs[0].data();
      // Check if the classroom subscription is active (you might need to adjust this check based on Stripe data)
      if (classroomData.subscriptionStatus === 'active') { // Assuming 'active' status from Stripe webhook
        isTeacherInClassroom = true;
        classroomSubscriptionStatus = 'classroom';
        classroomDocId = teacherSnap.docs[0].id; // Teacher's UID is the doc ID
        console.log(`User ${userId} is a TEACHER in an active classroom.`);
      }
    }

    // 2. If not a teacher, check if user is a student in ANY active classroom
    if (!isTeacherInClassroom && userEmail) {
      const studentQuery = query(classroomsRef, where("students", "array-contains", userEmail), limit(1));
      const studentSnap = await getDocs(studentQuery);
      if (!studentSnap.empty) {
         const classroomData = studentSnap.docs[0].data();
         // Check if the classroom subscription is active
         if (classroomData.subscriptionStatus === 'active') {
            isStudentInClassroom = true;
            classroomSubscriptionStatus = 'classroom';
            // We need the *teacher's* UID (doc ID) to update their usage later
            classroomDocId = studentSnap.docs[0].id;
            console.log(`User ${userId} (${userEmail}) is a STUDENT in active classroom ${classroomDocId}.`);
         }
      }
    }

    // Determine the relevant user document for credit tracking
    // If in a classroom, credits are tracked on the *teacher's* user document under a specific classroom structure.
    // Otherwise, track on the individual user's document.
    const effectiveUserId = (isTeacherInClassroom || isStudentInClassroom) ? classroomDocId : userId;
    const effectiveUserRef = doc(db, USERS_COLLECTION, effectiveUserId!); // Use ! as we ensure it's set if needed

    await runTransaction(db, async (transaction) => {
      const userOrTeacherDoc = await transaction.get(effectiveUserRef);
      if (!userOrTeacherDoc.exists()) {
        // This should ideally not happen for the teacher if they have a classroom,
        // but might happen for a student whose teacher's doc is missing.
        // Or if the individual user doc is missing.
        throw new Error(`Document for effective user ${effectiveUserId} does not exist!`);
      }

      const userData = userOrTeacherDoc.data() as UserData;
      let usageDataFieldPath: string; // Path to the specific usage data
      let currentCredits: number;
      let lastReset: number;
      let subscriptionType: SubscriptionStatus;
      let creditLimit: number;
      let isClassroomContext = isTeacherInClassroom || isStudentInClassroom;

      // Determine which usage data to use (individual, teacher, or student within classroom)
      if (isTeacherInClassroom) {
          usageDataFieldPath = `classroomUsage.teacher`;
          const teacherUsage = userData.classroomUsage?.teacher;
          currentCredits = teacherUsage?.credits ?? getCreditsForSubscription('classroom', true); // Default to max if not set
          lastReset = teacherUsage?.lastReset ?? 0;
          subscriptionType = 'classroom'; // Teacher context
          creditLimit = getCreditsForSubscription(subscriptionType, true);
          console.log(`Using TEACHER usage for classroom ${classroomDocId}. Current: ${currentCredits}, Limit: ${creditLimit}`);
      } else if (isStudentInClassroom) {
          // Use a dynamic path based on the student's UID
          usageDataFieldPath = `classroomUsage.students.${userId}`;
          const studentUsage = userData.classroomUsage?.students?.[userId];
          currentCredits = studentUsage?.credits ?? getCreditsForSubscription('classroom', false); // Default to max if not set
          lastReset = studentUsage?.lastReset ?? 0;
          subscriptionType = 'classroom'; // Student context
          creditLimit = getCreditsForSubscription(subscriptionType, false);
           console.log(`Using STUDENT usage for user ${userId} in classroom ${classroomDocId}. Current: ${currentCredits}, Limit: ${creditLimit}`);
      } else {
          // Individual user context (not in an active classroom)
          usageDataFieldPath = 'usage';
          currentCredits = userData.usage?.credits ?? getCreditsForSubscription('free'); // Default to free if no usage
          lastReset = userData.usage?.lastReset ?? 0;
          subscriptionType = userData.subscription || 'free';
          // Special handling for individual 'admin' or 'classroom' (if somehow set directly)
           if (subscriptionType === 'admin') {
               creditLimit = -1; // Unlimited
           } else if (subscriptionType === 'classroom') {
               // This case shouldn't normally happen for credit deduction unless it's a teacher's doc directly
               // If it's a teacher's doc, treat as teacher. Otherwise, fallback? Let's assume teacher here.
               creditLimit = getCreditsForSubscription('classroom', true);
           } else {
               creditLimit = getCreditsForSubscription(subscriptionType, false);
           }
          console.log(`Using INDIVIDUAL usage for user ${userId}. Sub: ${subscriptionType}, Current: ${currentCredits}, Limit: ${creditLimit}`);
      }

       // Check for Max subscription override for STUDENTS only
      if (isStudentInClassroom) {
        const studentDoc = await transaction.get(userRef); // Get the student's own doc
        if (studentDoc.exists()) {
            const studentData = studentDoc.data() as UserData;
            if (studentData.subscription === 'max') {
                console.log(`Student ${userId} has 'max' subscription, overriding classroom credits.`);
                // Switch context back to the individual student
                isClassroomContext = false;
                usageDataFieldPath = 'usage';
                currentCredits = studentData.usage?.credits ?? getCreditsForSubscription('max');
                lastReset = studentData.usage?.lastReset ?? 0;
                subscriptionType = 'max';
                creditLimit = getCreditsForSubscription(subscriptionType, false);
                 console.log(`Using individual MAX usage for student ${userId}. Current: ${currentCredits}, Limit: ${creditLimit}`);
            }
        }
      }

      const finalCurrentCredits = Number(currentCredits);
      
      // Handle unlimited credits (admin or classroom teacher/student with admin-like setup)
      if (creditLimit === -1 || finalCurrentCredits === -1) { 
        console.log(`User ${userId} (effective: ${effectiveUserId}) has unlimited credits.`);
        return; // Exit transaction successfully
      }

      const now = Date.now();
      const lastResetDate = new Date(lastReset);
      const nowDate = new Date(now);

      // Check if it's a new day (UTC)
      if (
        lastResetDate.getUTCFullYear() !== nowDate.getUTCFullYear() ||
        lastResetDate.getUTCMonth() !== nowDate.getUTCMonth() ||
        lastResetDate.getUTCDate() !== nowDate.getUTCDate()
      ) {
        console.log(`New day detected for ${usageDataFieldPath} on user ${effectiveUserId}. Resetting credits.`);
        // We know creditLimit must be > 0 here because of the earlier check
        let updatedCredits = creditLimit - creditsToDeduct;

        if (updatedCredits >= 0) {
          const updates: { [key: string]: any } = {};
          updates[`${usageDataFieldPath}.credits`] = updatedCredits;
          updates[`${usageDataFieldPath}.lastReset`] = now;
          transaction.update(effectiveUserRef, updates);
           console.log(`Credits sufficient after reset. Updating ${usageDataFieldPath} for ${effectiveUserId} to ${updatedCredits}.`);
        } else {
          // If a very expensive action is taken on a reset day, still deny but log the new reset day
          const updates: { [key: string]: any } = {};
          updates[`${usageDataFieldPath}.credits`] = creditLimit; // Reset credits to max
          updates[`${usageDataFieldPath}.lastReset`] = now;
          transaction.update(effectiveUserRef, updates);
          console.log(`Credits insufficient even after reset for ${usageDataFieldPath} on user ${effectiveUserId}. Credits remain ${creditLimit}.`);
          throw new Error("Not enough credits for this action after daily reset.");
        }
      } else {
        // Same day, just check credits
        // FIX: Use the defensively converted number for all math operations
        const remainingCredits = finalCurrentCredits - creditsToDeduct;
        
        if (remainingCredits >= 0) {
          const updates: { [key: string]: any } = {};
          updates[`${usageDataFieldPath}.credits`] = remainingCredits;
          // Only update credits, not lastReset
          transaction.update(effectiveUserRef, updates);
           console.log(`Credits sufficient. Updating ${usageDataFieldPath} for ${effectiveUserId} to ${remainingCredits}.`);
        } else {
          // FIX: Use finalCurrentCredits for console log
          console.log(`Credits insufficient for ${usageDataFieldPath} on user ${effectiveUserId}. Current: ${finalCurrentCredits}, Needed: ${creditsToDeduct}.`);
          throw new Error("Not enough credits for this action.");
        }
      }
    });

    // Transaction was successful
    return true;
  } catch (error: any) {
    console.error(`Credit check/decrement transaction failed for user ${userId} (email: ${userEmail}):`, error.message);
    // Transaction failed (e.g., not enough credits or other error)
    return false;
  }
};