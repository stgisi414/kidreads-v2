// hooks/useAuth.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  doc, onSnapshot, getDoc, collection, updateDoc,
  query, where, limit, getDocs, DocumentSnapshot, DocumentData, Timestamp
} from "firebase/firestore";
import { auth, db, payments } from '../firebase';
import { UserData, SubscriptionStatus, UsageData } from '../types';
import { onCurrentUserSubscriptionUpdate } from '@invertase/firestore-stripe-payments';

// Helper to determine credit count based on subscription type
export const getCreditsForSubscription = (subscription: SubscriptionStatus, isTeacher: boolean = false): number => {
  switch (subscription) {
    case 'inactive': return 0;
    case 'admin': return -1; // Unlimited
    case 'classroom': return isTeacher ? 30 : 10;
    case 'lite': return 10;
    case 'max': return 25;
    default: return 5; // Free
  }
};

// Helper to translate a Stripe role string into our SubscriptionStatus type
const getSubscriptionStatus = (stripeRole: string | undefined): SubscriptionStatus => {
  if (stripeRole === 'lite') return 'lite';
  if (stripeRole === 'max') return 'max';
  if (stripeRole === 'admin') return 'admin';
  if (stripeRole === 'classroom') return 'classroom';
  return 'free';
};

// Default usage data for new or logged-out users
export const defaultUsage: UsageData = { credits: 5, lastReset: 0 };

// Helper to update a user's usage data in Firestore
const updateUserUsage = async (userId: string, newUsage: UsageData) => {
    const userRef = doc(db, 'users', userId);
    try {
        await updateDoc(userRef, { usage: newUsage });
        console.log(`Firestore usage updated for user ${userId}:`, newUsage);
    } catch (error) {
        console.error(`Error updating Firestore usage for user ${userId}:`, error);
    }
};

const CLASSROOMS_COLLECTION = 'classrooms';
const USERS_COLLECTION = 'users';

export const useAuth = () => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  // Refs to hold the latest data from each async source
  const userDataFromDoc = useRef<Partial<UserData> | null>(null);
  const customerStripeId = useRef<string | undefined>(undefined);
  const stripeSubDetails = useRef<{ status: SubscriptionStatus; role?: string; usage?: UsageData, classroomUsage?: UserData['classroomUsage'] } | null>(null);
  const studentClassroomInfo = useRef<{ isStudent: boolean; teacherUid?: string; usage?: UsageData } | null>(null);

  // Refs to hold unsubscribe functions for cleanup
  const authUnsubscribeRef = useRef<(() => void) | null>(null);
  const userUnsubscribeRef = useRef<(() => void) | null>(null);
  const customerUnsubscribeRef = useRef<(() => void) | null>(null);
  const subscriptionUnsubscribeRef = useRef<(() => void) | null>(null);

  // Flags to manage the loading state
  const initialFetchComplete = useRef(false);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Central function to calculate and set the final user state from all available data
  const updateUserState = useCallback((baseAuthData: UserData | null) => {
    console.log("%c--- updateUserState CALLED ---", "color: blue; font-weight: bold;");

    if (!baseAuthData) {
        console.log("   updateUserState: No base auth data, setting user to null.");
        setUser(null);
        setLoading(false);
        initialFetchComplete.current = true;
        studentClassroomInfo.current = null;
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        return;
    }

    let finalState: UserData = { ...baseAuthData };

    // Apply data from user's own document first
    if (userDataFromDoc.current) {
        finalState = {
            ...finalState,
            preferences: userDataFromDoc.current.preferences ?? finalState.preferences,
            displayName: userDataFromDoc.current.displayName ?? finalState.displayName,
            photoURL: userDataFromDoc.current.photoURL ?? finalState.photoURL,
            memberOfClassroom: userDataFromDoc.current.memberOfClassroom,
            // Get potentially stale usage data from DB first
            usage: userDataFromDoc.current.usage ?? finalState.usage,
            classroomUsage: userDataFromDoc.current.classroomUsage ?? finalState.classroomUsage,
            isAdmin: userDataFromDoc.current.isAdmin ?? false, // Make sure isAdmin is pulled
            stripeRole: userDataFromDoc.current.stripeRole, // Pull stripeRole
        };
    }

    // Apply Stripe Customer ID
    if (customerStripeId.current) {
      finalState.stripeId = customerStripeId.current;
    }

    // Determine Final Status Based on Priority
    let finalSubscription: SubscriptionStatus = finalState.subscription; // Start with value from userDoc/base
    let finalUsage: UserData['usage'] = finalState.usage;
    let finalClassroomUsage: UserData['classroomUsage'] = finalState.classroomUsage;
    let finalStripeRole: string | undefined = finalState.stripeRole;
    let finalIsAdmin = finalState.isAdmin;


    // Priority 1: Admin check (Overrides everything)
    if (finalIsAdmin) {
      console.log("   updateUserState: Priority 1: Admin detected.");
      finalSubscription = 'admin';
      finalUsage = { credits: -1, lastReset: Date.now() }; // Unlimited
      finalClassroomUsage = undefined; // Admins don't use classroom usage directly
      finalStripeRole = undefined;
    }
    // Priority 2: Confirmed Student check
    else if (studentClassroomInfo.current?.isStudent) {
      console.log("%c   updateUserState: Priority 2: Confirmed Student detected.", "color: green; font-weight: bold;");
      finalSubscription = 'classroom';
      // Use student usage data determined during the check
      finalUsage = studentClassroomInfo.current.usage || { credits: getCreditsForSubscription('classroom', false), lastReset: 0 };
      finalClassroomUsage = undefined; // Students don't have teacher/classroom data on their own doc
      finalStripeRole = 'classroom'; // Reflects their status via classroom membership
    }
    // Priority 3: Stripe Subscriber (Teacher or Individual), ONLY if not already overridden by Admin/Student
    else if (stripeSubDetails.current && stripeSubDetails.current.status !== 'free') {
      console.log("   updateUserState: Priority 3: Stripe details applied.");
      // Use the status determined from the active Stripe subscription
      finalSubscription = stripeSubDetails.current.status;
      finalStripeRole = stripeSubDetails.current.role;

      // If they just became a teacher via Stripe, ensure classroomUsage is initialized
      if (finalSubscription === 'classroom' && !finalClassroomUsage?.teacher) {
           console.log("   updateUserState: Initializing teacher usage based on new Stripe role.");
           finalClassroomUsage = {
               teacher: { credits: getCreditsForSubscription('classroom', true), lastReset: 0 },
               students: finalClassroomUsage?.students || {} // Keep existing students if any
           };
           finalUsage = undefined; // Teachers don't use individual usage
      }
      // If they just became Lite/Max via Stripe, ensure individual usage is initialized
      else if ( (finalSubscription === 'lite' || finalSubscription === 'max') && !finalUsage) {
          console.log("   updateUserState: Initializing individual usage based on new Stripe role.");
          finalUsage = { credits: getCreditsForSubscription(finalSubscription), lastReset: 0 };
          finalClassroomUsage = undefined; // Clear classroom usage if switching to individual
      }
    }
     // Priority 4: Fallback to Free / Defaults (if no admin, student, or active Stripe sub)
    else if (finalSubscription !== 'free') { // Only log if it wasn't already free
        console.log("   updateUserState: Priority 4: No active Admin/Student/Stripe status, falling back to Free.");
        finalSubscription = 'free';
        finalStripeRole = undefined;
        finalUsage = finalUsage || defaultUsage; // Ensure usage exists
        finalClassroomUsage = undefined; // Clear classroom usage
    }

    // Apply the finally determined state
    finalState.isAdmin = finalIsAdmin;
    finalState.subscription = finalSubscription;
    finalState.stripeRole = finalStripeRole; // Store the role from Stripe/logic

    // --- LOGIC TO CALCULATE DISPLAY CREDITS ---
    const isTeacher = finalSubscription === 'classroom' && !!finalClassroomUsage?.teacher;
    const relevantUsage = isTeacher
      ? finalClassroomUsage?.teacher
      : finalUsage; // Student usage is already placed in finalUsage by Priority 2

    const creditsFromDb = relevantUsage?.credits ?? defaultUsage.credits;
    const lastResetTimestamp = relevantUsage?.lastReset || 0;
    const creditLimit = getCreditsForSubscription(finalSubscription, isTeacher);

    const hasResetTimePassed = () => {
        if (finalIsAdmin || creditLimit === -1) return false;
        if (lastResetTimestamp === 0 && creditsFromDb < creditLimit) return true; // Special case: never reset but not full? Show full.

        const lastResetDate = new Date(lastResetTimestamp);
        const now = new Date();
        // Check if the UTC day, month, or year is different
        return lastResetDate.getUTCDate() !== now.getUTCDate() ||
               lastResetDate.getUTCMonth() !== now.getUTCMonth() ||
               lastResetDate.getUTCFullYear() !== now.getUTCFullYear();
    };

    // Calculate the credits to *display*
    const displayCredits = hasResetTimePassed() ? creditLimit : creditsFromDb;

    // Store both the DB value and the calculated display value in the final state
    // We modify the 'usage' or 'classroomUsage.teacher' object directly for simplicity here.
    if (isTeacher && finalClassroomUsage?.teacher) {
        finalState.classroomUsage = {
            ...finalClassroomUsage,
            teacher: { ...finalClassroomUsage.teacher, credits: displayCredits } // Store display value here
        };
         finalState.usage = undefined; // Ensure individual usage is cleared for teachers
        console.log(`   updateUserState: Calculated teacher display credits: ${displayCredits}`);
    } else if (finalUsage) { // Covers free, lite, max, student, potentially admin before override
        finalState.usage = { ...finalUsage, credits: displayCredits }; // Store display value here
         finalState.classroomUsage = undefined; // Ensure classroomUsage is cleared for non-teachers
        console.log(`   updateUserState: Calculated individual/student display credits: ${displayCredits}`);
    }
     // For admin, ensure credits remain -1 even after display calc attempt
    if (finalIsAdmin) {
        finalState.usage = { credits: -1, lastReset: Date.now() };
    }
    // --- END LOGIC TO CALCULATE DISPLAY CREDITS ---

    console.log("%c   updateUserState: Final calculated state (with display credits):", "color: blue; font-weight: bold;", JSON.stringify(finalState, null, 2));
    setUser(finalState); // Set the state with the potentially overridden 'credits' value

    // Stop loading
    if (initialFetchComplete.current && loading) {
       console.log("   updateUserState: Initial fetch complete, setting loading to false.");
       setLoading(false);
       if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    }
  }, [loading]); // Added `loading` to dependencies to re-evaluate on loading change

  // ... (The rest of the useEffect hook remains unchanged)
  useEffect(() => {
    console.log("%cuseAuth: Main effect setup (runs once).", "color: orange;");

    // Clear all refs from previous runs
    userDataFromDoc.current = null;
    customerStripeId.current = undefined;
    stripeSubDetails.current = null;
    studentClassroomInfo.current = null;
    initialFetchComplete.current = false;
    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);

    authUnsubscribeRef.current = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      console.log("%c>>> useAuth: onAuthStateChanged TRIGGERED. User:", "color: purple;", firebaseUser?.uid);

      // Cleanup all previous listeners before setting up new ones
      userUnsubscribeRef.current?.();
      customerUnsubscribeRef.current?.();
      subscriptionUnsubscribeRef.current?.();
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);

      // Reset state and refs for new auth state
      setUser(null);
      setLoading(true);
      userDataFromDoc.current = null;
      customerStripeId.current = undefined;
      stripeSubDetails.current = null;
      studentClassroomInfo.current = null;
      initialFetchComplete.current = false;

      if (!firebaseUser) {
        updateUserState(null); // Sign out
        return;
      }

      // --- Start fresh for the new user ---
      const userId = firebaseUser.uid;
      const baseAuthData: UserData = {
           uid: userId,
           email: firebaseUser.email,
           displayName: firebaseUser.displayName,
           photoURL: firebaseUser.photoURL,
           isAdmin: false,
           subscription: 'free',
           usage: defaultUsage,
       };

      // Set timeout fallback in case listeners never resolve
      loadingTimeoutRef.current = setTimeout(() => {
         console.warn("!!! Loading Timeout Fallback Triggered !!!");
         initialFetchComplete.current = true;
         updateUserState(baseAuthData);
      }, 7000);

      // --- Listener Promises ---
      const userDocPromise = new Promise<void>(resolve => {
        const userDocRef = doc(db, USERS_COLLECTION, userId);
        userUnsubscribeRef.current = onSnapshot(userDocRef, async (docSnap) => {
            console.log("%c>>> UserDoc Snapshot received.", "color: purple;");
            const userData = docSnap.data() as Partial<UserData> | undefined;
            userDataFromDoc.current = userData || {};

            // --- New Student Check Logic (triggered by user doc) ---
            if (userData?.memberOfClassroom) {
                const teacherUid = userData.memberOfClassroom;
                console.log(`   UserDoc: Found memberOfClassroom: ${teacherUid}. Checking classroom status.`);
                try {
                    const classroomDocRef = doc(db, CLASSROOMS_COLLECTION, teacherUid);
                    const classroomSnap = await getDoc(classroomDocRef);

                    if (classroomSnap.exists() && classroomSnap.data()?.subscriptionStatus === 'active') {
                        const teacherUserRef = doc(db, USERS_COLLECTION, teacherUid);
                        const teacherSnap = await getDoc(teacherUserRef);
                        if (teacherSnap.exists()) {
                            const teacherData = teacherSnap.data() as UserData;
                            const sUsage = teacherData.classroomUsage?.students?.[userId] || { credits: getCreditsForSubscription('classroom', false), lastReset: 0 };
                            studentClassroomInfo.current = { isStudent: true, teacherUid, usage: sUsage };
                            console.log("%c      Student check SUCCESS via UserDoc:", "color: green; font-weight: bold;", studentClassroomInfo.current);
                        } else {
                            studentClassroomInfo.current = { isStudent: false };
                        }
                    } else {
                        studentClassroomInfo.current = { isStudent: false };
                    }
                } catch (error) {
                     studentClassroomInfo.current = { isStudent: false };
                }
            } else {
                 studentClassroomInfo.current = { isStudent: false };
            }
            // --- End Student Check ---

            if (!initialFetchComplete.current) resolve();
            updateUserState(baseAuthData);
        }, (error) => {
            console.error(">>> UserDoc Snapshot ERROR:", error);
            if (!initialFetchComplete.current) resolve();
            updateUserState(baseAuthData);
        });
      });

      const customerDocPromise = new Promise<void>(resolve => {
            const customerDocRef = doc(db, 'customers', userId);
            customerUnsubscribeRef.current = onSnapshot(customerDocRef, (docSnap) => {
            console.log("%c>>> CustomerDoc Snapshot received.", "color: purple;");
            customerStripeId.current = docSnap.data()?.stripeId;
            if (!initialFetchComplete.current) resolve();
            updateUserState(baseAuthData);
        }, (error) => {
             console.error(">>> CustomerDoc Snapshot ERROR:", error);
             if (!initialFetchComplete.current) resolve();
             updateUserState(baseAuthData);
        });
      });

      const stripeSubPromise = new Promise<void>(resolve => {
        subscriptionUnsubscribeRef.current = onCurrentUserSubscriptionUpdate(payments, async (snapshot) => {
             let subStatus: SubscriptionStatus = 'free';
             let subRole: string | undefined = undefined;

             if (snapshot?.subscriptions?.length > 0) {
                 const sortedSubs = [...snapshot.subscriptions].sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
                 const newestActiveSub = sortedSubs.find(sub => ['active', 'trialing'].includes(sub.status));

                 if (newestActiveSub) {
                      try {
                          const subDocSnap = await getDoc(doc(db, 'customers', userId, 'subscriptions', newestActiveSub.id));
                          if (subDocSnap.exists()) {
                              const subData = subDocSnap.data();
                              const roleFromMetadata = subData?.items?.[0]?.price?.product?.metadata?.stripeRole;
                              subRole = (roleFromMetadata as string | undefined) ?? subData?.role;
                              subStatus = getSubscriptionStatus(subRole);
                          }
                      } catch (err) { console.error("Error fetching sub doc:", err); }
                 }
                 // NO "ELSE" BLOCK. If there's no active subscription, we do nothing.
                 // We DO NOT reset credits here. That was the bug.
             }
             
             // This listener is now READ-ONLY. It only sets status and role.
             stripeSubDetails.current = { status: subStatus, role: subRole };

             if (!initialFetchComplete.current) resolve();
             updateUserState(baseAuthData);
        });
      });

      // Wait for all initial listener calls to resolve
      console.log("   Waiting for initial listener snapshots...");
      try {
          await Promise.all([userDocPromise, customerDocPromise, stripeSubPromise]);
          console.log("%c--- Initial listener snapshots COMPLETE ---", "color: green; font-weight: bold;");
      } catch (error) {
           console.error("Error awaiting initial snapshots:", error);
      } finally {
          initialFetchComplete.current = true;
          updateUserState(baseAuthData); // Perform final update
          if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      }
    }); // End of onAuthStateChanged

    // Main cleanup on unmount
    return () => {
        console.log("%cuseAuth: Cleaning up ALL listeners.", "color: orange;");
        authUnsubscribeRef.current?.();
        userUnsubscribeRef.current?.();
        customerUnsubscribeRef.current?.();
        subscriptionUnsubscribeRef.current?.();
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    };
  }, []); // Empty array ensures this effect runs only once

  return { user, loading };
};