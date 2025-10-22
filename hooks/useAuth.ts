// hooks/useAuth.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  doc, onSnapshot, getDoc, collection, updateDoc,
  query, where, limit, getDocs, DocumentSnapshot, DocumentData, Timestamp
} from "firebase/firestore";
import { auth, db, payments } from '../firebase';
import { UserData, SubscriptionStatus, UsageData, ClassroomData } from '../types';
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

    // Apply data from user's own document
    if (userDataFromDoc.current) {
        finalState = {
            ...finalState,
            preferences: userDataFromDoc.current.preferences ?? finalState.preferences,
            displayName: userDataFromDoc.current.displayName ?? finalState.displayName,
            photoURL: userDataFromDoc.current.photoURL ?? finalState.photoURL,
            memberOfClassroom: userDataFromDoc.current.memberOfClassroom,
         };
    }

    // Apply Stripe Customer ID
    if (customerStripeId.current) {
        finalState.stripeId = customerStripeId.current;
    }

    // --- Determine Final Status Based on Priority ---
    let finalSubscription: SubscriptionStatus = userDataFromDoc.current?.subscription || baseAuthData.subscription;
    let finalUsage: UsageData | undefined = userDataFromDoc.current?.usage || baseAuthData.usage;
    let finalClassroomUsage: UserData['classroomUsage'] | undefined = userDataFromDoc.current?.classroomUsage;
    let finalStripeRole: string | undefined = userDataFromDoc.current?.stripeRole;
    let finalIsAdmin = userDataFromDoc.current?.isAdmin || false;

    // Priority 1: Admin
    if (finalIsAdmin) {
        console.log("   updateUserState: Priority 1: Admin detected.");
        finalSubscription = 'admin';
        finalUsage = { credits: -1, lastReset: Date.now() };
        finalClassroomUsage = undefined;
        finalStripeRole = undefined;
    }
    // Priority 2: Confirmed Student
    else if (studentClassroomInfo.current?.isStudent) {
        console.log("%c   updateUserState: Priority 2: Confirmed Student detected.", "color: green; font-weight: bold;");
        finalSubscription = 'classroom';
        finalUsage = studentClassroomInfo.current.usage || { credits: getCreditsForSubscription('classroom', false), lastReset: 0 };
        finalClassroomUsage = undefined;
        finalStripeRole = 'classroom';
        finalIsAdmin = false;
    }
    // Priority 3: Stripe Subscriber (Teacher or Individual)
    else if (stripeSubDetails.current) {
        console.log("   updateUserState: Priority 3: Stripe details applied.");
        finalSubscription = stripeSubDetails.current.status;
        finalStripeRole = stripeSubDetails.current.role;
        finalUsage = stripeSubDetails.current.usage;
        finalClassroomUsage = stripeSubDetails.current.classroomUsage;
    }
    // Priority 4: Fallback to defaults
    else {
         console.log("   updateUserState: Priority 4: Using User Doc / Base Defaults.");
    }

    // Apply the final determined state
    finalState.isAdmin = finalIsAdmin;
    finalState.subscription = finalSubscription;
    finalState.usage = finalUsage;
    finalState.classroomUsage = finalClassroomUsage;
    finalState.stripeRole = finalStripeRole;

    console.log("%c   updateUserState: Final calculated state:", "color: blue; font-weight: bold;", JSON.stringify(finalState, null, 2));
    setUser(finalState);

    // Stop loading only after the initial fetch cycle is complete
    if (initialFetchComplete.current && loading) {
       console.log("   updateUserState: Initial fetch complete, setting loading to false.");
       setLoading(false);
       if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    }
  }, []); // Empty dependency array makes this function stable

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
             console.log("%c>>> Stripe Subscription Snapshot received.", "color: purple;");
             stripeSubDetails.current = null; // Reset for recalculation

             let subStatus: SubscriptionStatus = 'free';
             let subRole: string | undefined = undefined;
             let subUsage: UsageData | undefined = undefined;
             let subClassroomUsage: UserData['classroomUsage'] = undefined;
             const previousSub = userDataFromDoc.current?.subscription;

             if (snapshot && Array.isArray(snapshot.subscriptions) && snapshot.subscriptions.length > 0) {
                 const sortedSubs = snapshot.subscriptions.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
                 const newestActiveSub = sortedSubs.find(sub => sub && ['active', 'trialing'].includes(sub.status));

                 if (newestActiveSub) {
                      let fetchedRole: string | undefined;
                      try {
                          const subDocRef = doc(db, 'customers', userId, 'subscriptions', newestActiveSub.id);
                          const subDocSnap = await getDoc(subDocRef);
                           if (subDocSnap.exists()) {
                                const subData = subDocSnap.data();
                                const roleFromMetadata = subData?.items?.[0]?.price?.product?.metadata?.stripeRole;
                                fetchedRole = (roleFromMetadata as string | undefined) ?? subData?.role;
                            }
                      } catch (err) { console.error("Error fetching sub doc:", err); }

                      subRole = fetchedRole;
                      subStatus = getSubscriptionStatus(subRole);
                      const isTeacher = subStatus === 'classroom';
                      const newMaxCredits = getCreditsForSubscription(subStatus, isTeacher);
                      subUsage = { credits: newMaxCredits, lastReset: Date.now() };

                      if (isTeacher) {
                          subClassroomUsage = { teacher: subUsage, students: userDataFromDoc.current?.classroomUsage?.students || {} };
                          subUsage = undefined;
                      } else {
                           subClassroomUsage = undefined;
                      }
                 } else { // No active sub
                      if (previousSub && previousSub !== 'free' && previousSub !== 'admin') {
                          await updateUserUsage(userId, defaultUsage);
                      }
                      subUsage = defaultUsage;
                 }
             } else { // No subs array
                  if (previousSub && previousSub !== 'free' && previousSub !== 'admin') {
                      await updateUserUsage(userId, defaultUsage);
                  }
                  subUsage = defaultUsage;
             }
             stripeSubDetails.current = { status: subStatus, role: subRole, usage: subUsage, classroomUsage: subClassroomUsage };
             console.log("      Stripe details stored:", stripeSubDetails.current);

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
