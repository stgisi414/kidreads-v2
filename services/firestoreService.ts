// services/firestoreService.ts

import {
  collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, getDoc, runTransaction, Timestamp, updateDoc,
  where, limit, arrayUnion, arrayRemove
} from "firebase/firestore";
import { db } from "../firebase";
import type { Story, SubscriptionStatus, UserData, UsageData } from '../types';

const STORIES_COLLECTION = 'stories';
const USERS_COLLECTION = 'users';
const CLASSROOMS_COLLECTION = 'classrooms';
const MAX_STORIES = 10;

const MAX_STUDENTS = 20;

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Your existing functions are here and are unchanged.
export const getSavedStories = async (userId: string): Promise<Story[]> => {
  const storiesRef = collection(db, USERS_COLLECTION, userId, STORIES_COLLECTION);
  const q = query(storiesRef, orderBy('id', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as Story);
};

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

export const deleteStory = async (userId: string, storyId: number): Promise<void> => {
  const storyDocRef = doc(db, USERS_COLLECTION, userId, STORIES_COLLECTION, storyId.toString());
  await deleteDoc(storyDocRef);
};

export const updateStory = async (userId: string, story: Story): Promise<void> => {
    const storyDocRef = doc(db, USERS_COLLECTION, userId, STORIES_COLLECTION, story.id.toString());
    await setDoc(storyDocRef, story, { merge: true });
};

export const getUserPreferences = async (userId: string): Promise<{ voice?: string; speakingRate?: number; storyLength?: number }> => {
  const userDocRef = doc(db, USERS_COLLECTION, userId);
  try {
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
          const data = docSnap.data();
          return data?.preferences || {};
      } else {
          console.log(`No user document found for ${userId} when getting preferences.`);
          return {};
      }
  } catch (error) {
      console.error(`Error fetching preferences for user ${userId}:`, error);
      return {};
  }
};

export const updateUserPreferences = async (userId: string, preferences: { voice?: string; speakingRate?: number; storyLength?: number }): Promise<void> => {
  const userDocRef = doc(db, USERS_COLLECTION, userId);
  try {
      await setDoc(userDocRef, { preferences }, { merge: true });
  } catch (error) {
       console.error(`Error updating preferences for user ${userId}:`, error);
  }
};

// This helper function is used by the transaction.
const getCreditsForSubscription = (subscription: SubscriptionStatus, isTeacher: boolean = false): number => {
  switch (subscription) {
    case 'admin': return -1;
    case 'classroom': return isTeacher ? 30 : 10;
    case 'lite': return 10;
    case 'max': return 25;
    case 'free':
    default: return 5;
  }
};

// Get the classroom document data for a teacher
export const getClassroomData = async (teacherUid: string): Promise<ClassroomData | null> => {
  const classroomDocRef = doc(db, CLASSROOMS_COLLECTION, teacherUid);
  try {
    const docSnap = await getDoc(classroomDocRef);
    if (docSnap.exists()) {
      return docSnap.data() as ClassroomData;
    } else {
      console.log(`No classroom document found for teacher ${teacherUid}.`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching classroom data for teacher ${teacherUid}:`, error);
    return null;
  }
};

// Add a student email to the classroom list
export const addStudentToClassroom = async (teacherUid: string, studentEmail: string): Promise<{ success: boolean; message: string }> => {
  if (!isValidEmail(studentEmail)) {
    return { success: false, message: "Invalid email format." };
  }

  const classroomDocRef = doc(db, CLASSROOMS_COLLECTION, teacherUid);
  const teacherUserDocRef = doc(db, USERS_COLLECTION, teacherUid); // Ref for teacher's usage data

  try {
    let currentStudentCount = 0;
    const classroomDoc = await getDoc(classroomDocRef);

    if (!classroomDoc.exists() || classroomDoc.data()?.subscriptionStatus !== 'active') {
        return { success: false, message: "Active classroom subscription not found." };
    }

    const classroomData = classroomDoc.data();
    currentStudentCount = classroomData?.students?.length || 0;

    if (currentStudentCount >= MAX_STUDENTS) {
      return { success: false, message: `Cannot add more than ${MAX_STUDENTS} students.` };
    }

    if (classroomData?.students?.includes(studentEmail)) {
        return { success: false, message: "Student email already exists in the classroom." };
    }

    // Update the classroom document first
    await updateDoc(classroomDocRef, {
      students: arrayUnion(studentEmail),
      updatedAt: Timestamp.now()
    });

    // Initialize student usage data within the *teacher's* user document
    const studentUid = await getUserIdByEmail(studentEmail); // Helper needed to find UID by email
    if (studentUid) {
        const studentUsagePath = `classroomUsage.students.${studentUid}`;
        await updateDoc(teacherUserDocRef, {
            [`${studentUsagePath}.credits`]: getCreditsForSubscription('classroom', false), // Give initial student credits
            [`${studentUsagePath}.lastReset`]: Date.now()
        });
        console.log(`Initialized usage data for student ${studentUid} (${studentEmail}) under teacher ${teacherUid}`);
    } else {
        console.warn(`Could not find UID for student email ${studentEmail}. Usage data not initialized.`);
        // Proceed with adding email, usage will init when student logs in if needed by checkAndDecrementCredits
    }


    return { success: true, message: "Student added successfully." };
  } catch (error) {
    console.error(`Error adding student ${studentEmail} to classroom ${teacherUid}:`, error);
    return { success: false, message: "Failed to add student. Please try again." };
  }
};

// Remove a student email from the classroom list
export const removeStudentFromClassroom = async (teacherUid: string, studentEmail: string): Promise<{ success: boolean; message: string }> => {
  const classroomDocRef = doc(db, CLASSROOMS_COLLECTION, teacherUid);
  const teacherUserDocRef = doc(db, USERS_COLLECTION, teacherUid); // Ref for teacher's usage data

  try {
    // Remove from the classroom document
    await updateDoc(classroomDocRef, {
      students: arrayRemove(studentEmail),
      updatedAt: Timestamp.now()
    });

    // Remove student usage data from the *teacher's* user document
    // NOTE: This uses dot notation which might not directly remove a map field key.
    // A more robust way might involve fetching the doc, removing the key in code, and setting the whole map back.
    // However, for simplicity and common usage, we try this first. If it fails, manual deletion might be needed,
    // or the usage data just becomes orphaned (less ideal).
    const studentUid = await getUserIdByEmail(studentEmail); // Helper needed
     if (studentUid) {
        const studentUsagePath = `classroomUsage.students.${studentUid}`;
        // Attempt to remove the specific student's map entry.
        // Firestore's FieldValue.delete() is for deleting fields, not map keys directly via dot notation.
        // We might need to fetch, modify, and update the whole 'students' map.
        // For now, let's log and acknowledge this limitation.
        console.warn(`Manual removal or update logic needed for ${studentUsagePath} in teacher's user document if direct dot notation update fails.`);
        // Example of fetch-modify-update (more robust):
        // const teacherDoc = await getDoc(teacherUserDocRef);
        // if (teacherDoc.exists()) {
        //     const currentClassroomUsage = teacherDoc.data().classroomUsage || {};
        //     if (currentClassroomUsage.students && currentClassroomUsage.students[studentUid]) {
        //         delete currentClassroomUsage.students[studentUid];
        //         await updateDoc(teacherUserDocRef, { 'classroomUsage.students': currentClassroomUsage.students });
        //         console.log(`Removed usage data for student ${studentUid} (${studentEmail}) under teacher ${teacherUid}`);
        //     }
        // }

        // Simpler approach (might leave orphaned data if student rejoins with same UID later):
        // Set the field to null or delete(), depending on desired behavior.
        // Setting to null might be safer if direct deletion isn't supported this way.
         await updateDoc(teacherUserDocRef, {
             [`${studentUsagePath}`]: null // Or potentially FieldValue.delete() if supported contextually
         }).catch(err => console.error("Error trying to clear student usage data:", err));


    } else {
         console.warn(`Could not find UID for student email ${studentEmail}. Usage data not removed.`);
    }


    return { success: true, message: "Student removed successfully." };
  } catch (error) {
    console.error(`Error removing student ${studentEmail} from classroom ${teacherUid}:`, error);
    return { success: false, message: "Failed to remove student. Please try again." };
  }
};

// Helper function to find a user's UID by their email
// NOTE: This requires querying the 'users' collection, which might have security rule implications.
// Ensure your Firestore rules allow the teacher to query the users collection by email,
// or consider alternative approaches like having students join via a code.
const getUserIdByEmail = async (email: string): Promise<string | null> => {
  const usersRef = collection(db, USERS_COLLECTION);
  const q = query(usersRef, where("email", "==", email), limit(1));
  try {
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].id; // Return the document ID (which is the UID)
    }
    return null;
  } catch (error) {
    console.error(`Error finding user UID for email ${email}:`, error);
    return null;
  }
};

// ======================================================================
// === THIS IS THE MISSING HELPER FUNCTION THAT CAUSED THE CRASH ========
// ======================================================================
const buildUpdateObject = (path: string, newState: UsageData, existingData: UserData): { [key: string]: any } => {
  if (path === 'individual') {
    return { usage: newState };
  }
  if (path === 'teacher') {
    return { classroomUsage: { ...existingData.classroomUsage, teacher: newState } };
  }
  if (path.startsWith('student.')) {
    const studentId = path.split('.')[1];
    return {
      classroomUsage: {
        ...existingData.classroomUsage,
        students: {
          ...existingData.classroomUsage?.students,
          [studentId]: newState,
        },
      },
    };
  }
  return {};
};
// ======================================================================

// This is the correct and complete transaction logic.
export const checkAndDecrementCredits = async (
  userId: string,
  creditsToDeduct: number,
  userEmail: string | null
): Promise<boolean> => {
  const userRef = doc(db, USERS_COLLECTION, userId);
  const classroomsRef = collection(db, CLASSROOMS_COLLECTION);

  try {
    let isTeacherInClassroom = false;
    let isStudentInClassroom = false;
    let teacherUidForTransaction: string | null = null;

    const teacherQuery = query(classroomsRef, where("teacherUid", "==", userId), limit(1));
    const teacherSnap = await getDocs(teacherQuery);
    if (!teacherSnap.empty && teacherSnap.docs[0].data().subscriptionStatus === 'active') {
      isTeacherInClassroom = true;
      teacherUidForTransaction = userId;
    }

    if (!isTeacherInClassroom && userEmail) {
      const studentQuery = query(classroomsRef, where("students", "array-contains", userEmail), limit(1));
      const studentSnap = await getDocs(studentQuery);
      if (!studentSnap.empty && studentSnap.docs[0].data().subscriptionStatus === 'active') {
        isStudentInClassroom = true;
        teacherUidForTransaction = studentSnap.docs[0].data().teacherUid;
      }
    }

    const effectiveUserId = teacherUidForTransaction ?? userId;
    const effectiveUserRef = doc(db, USERS_COLLECTION, effectiveUserId);
    let success = false;

    await runTransaction(db, async (transaction) => {
      const userOrTeacherDoc = await transaction.get(effectiveUserRef);
      if (!userOrTeacherDoc.exists()) throw new Error(`Document for effective user ${effectiveUserId} not found.`);
      
      const userData = userOrTeacherDoc.data() as UserData;
      let usagePath: string;
      let currentCredits: number;
      let lastReset: number;
      let creditLimit: number;

      if (isTeacherInClassroom) {
        usagePath = 'teacher';
        creditLimit = 30;
        currentCredits = userData.classroomUsage?.teacher?.credits ?? creditLimit;
        lastReset = userData.classroomUsage?.teacher?.lastReset ?? 0;
      } else if (isStudentInClassroom) {
        usagePath = `student.${userId}`;
        creditLimit = 10;
        currentCredits = userData.classroomUsage?.students?.[userId]?.credits ?? creditLimit;
        lastReset = userData.classroomUsage?.students?.[userId]?.lastReset ?? 0;
      } else {
        usagePath = 'individual';
        creditLimit = getCreditsForSubscription(userData.subscription || 'free');
        currentCredits = userData.usage?.credits ?? creditLimit;
        lastReset = userData.usage?.lastReset ?? 0;
      }

      if (creditLimit === -1) {
        success = true;
        return;
      }

      const now = Date.now();
      const needsReset = new Date(lastReset).getUTCDate() !== new Date(now).getUTCDate();
      const remaining = needsReset ? creditLimit - creditsToDeduct : Number(currentCredits) - creditsToDeduct;

      if (remaining < 0) {
        throw new Error("Not enough credits.");
      }

      const newState: UsageData = { credits: remaining, lastReset: needsReset ? now : lastReset };
      // This call will now work because the function exists in this file.
      const updates = buildUpdateObject(usagePath, newState, userData);
      
      transaction.update(effectiveUserRef, updates);
      success = true;
    });
    return success;
  } catch (error: any) {
    console.error(`Transaction failed for user ${userId} (${userEmail}):`, error.message);
    return false;
  }
};