// hooks/useAuth.ts

import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, getDoc, collection, updateDoc } from "firebase/firestore";
import { auth, db, payments } from '../firebase';
import { UserData, SubscriptionStatus, UsageData } from '../types';
import { onCurrentUserSubscriptionUpdate, Subscription } from '@invertase/firestore-stripe-payments';

// Helper function to determine subscription status from Stripe role
const getSubscriptionStatus = (stripeRole: string | undefined): SubscriptionStatus => {
  if (stripeRole === 'lite') return 'lite';
  if (stripeRole === 'max') return 'max';
  if (stripeRole === 'admin') return 'admin';
  if (stripeRole === 'classroom') return 'classroom';
  return 'free';
};

// Helper function to get the credit limit for a subscription status
const getCreditsForSubscription = (subscription: SubscriptionStatus, isTeacher: boolean = false): number => { // <-- Add isTeacher flag
  switch (subscription) {
    case 'inactive': return 0;
    case 'admin': return -1; // Unlimited
    case 'classroom': return isTeacher ? 30 : 10;
    case 'lite': return 10;
    case 'max': return 25;
    default: return 5; // Free
  }
};

// Default usage data for new users or fallback
const defaultUsage: UsageData = { credits: 5, lastReset: 0 };

// Helper function to update user usage data in Firestore
const updateUserUsage = async (userId: string, newUsage: UsageData) => {
    const userRef = doc(db, 'users', userId);
    try {
        await updateDoc(userRef, { usage: newUsage });
        console.log(`Firestore usage updated for user ${userId}:`, newUsage); // DEBUG
    } catch (error) {
        console.error(`Error updating Firestore usage for user ${userId}:`, error); // DEBUG
    }
};


export const useAuth = () => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  // Refs to hold unsubscribe functions for listeners
  const userUnsubscribeRef = useRef(() => {});
  const customerUnsubscribeRef = useRef(() => {});
  const subscriptionUnsubscribeRef = useRef(() => {});

  useEffect(() => {
    console.log("useAuth: Effect started."); // DEBUG

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser: User | null) => {
      // --- Cleanup previous listeners on auth change ---
      userUnsubscribeRef.current();
      customerUnsubscribeRef.current();
      subscriptionUnsubscribeRef.current();
      setUser(null); // Reset user state
      setLoading(true); // Reset loading state
      console.log("useAuth: Auth state changed. User:", firebaseUser?.uid || 'null'); // DEBUG

      if (firebaseUser) {
        const userId = firebaseUser.uid;
        const userRef = doc(db, 'users', userId);
        const customerRef = doc(db, 'customers', userId);
        const subscriptionsRef = collection(db, 'customers', userId, 'subscriptions');

        // --- Base User State from Auth ---
        // Immediately set state with core Auth details to prevent missing photoURL/displayName
        const baseUserData: UserData = {
            uid: userId,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            // Set initial defaults, listeners will update these
            isAdmin: false,
            subscription: 'free',
            usage: defaultUsage,
            stripeId: undefined,
            stripeRole: undefined,
        };
        setUser(baseUserData);
        console.log("useAuth: Initial base user state set:", baseUserData); // DEBUG


        // --- Set up new listeners ---

        // Listener 1: User Document (updates isAdmin, usage, potentially initial subscription)
        console.log("useAuth: Setting up userDoc listener for", userId); // DEBUG
        userUnsubscribeRef.current = onSnapshot(userRef, (userDoc) => {
            console.log(">>> useAuth: userDoc listener FIRED.");
            const userData = userDoc.data() as UserData | undefined;
            console.log("   userDoc data:", userData);
            setUser(prev => {
                const previousState = prev || baseUserData;
                // Determine admin status from doc OR previous state if doc doesn't specify
                const isAdmin = userData?.isAdmin ?? previousState.isAdmin ?? false;
                // Determine subscription from doc OR previous state
                let subscription = userData?.subscription ?? previousState.subscription ?? 'free';
                // If admin flag is true, force subscription to 'admin'
                if (isAdmin) {
                    subscription = 'admin';
                }

                // --- NEW: Initialize classroomUsage if missing ---
                let usage = userData?.usage || defaultUsage;
                let classroomUsage = userData?.classroomUsage; // Keep existing if present

                return {
                    ...baseUserData, // Start with fresh auth data
                    ...previousState, // Merge previous state (stripe data)
                    // Apply updates from this doc
                    isAdmin: isAdmin,
                    subscription: subscription, // Use potentially overridden subscription
                    usage: usage,
                    classroomUsage: classroomUsage, // Add classroomUsage
                };
            });
        }, (error) => {
             console.error(">>> useAuth: userDoc listener ERROR:", error);
             // Set fallback state including base auth info
              setUser({
                ...baseUserData,
                subscription: 'free',
                usage: defaultUsage,
                isAdmin: false,
             });
             setLoading(false); // Stop loading on error
        });


        // --- Customer Listener (no change needed) ---
        customerUnsubscribeRef.current = onSnapshot(customerRef, (customerDoc) => {
             // ... (no changes needed here) ...
             console.log(">>> useAuth: customerDoc listener FIRED."); // DEBUG
             const customerData = customerDoc.data();
             console.log("   customerDoc data:", customerData); // DEBUG
             setUser(prev => {
                const previousState = prev || baseUserData;
                return {
                    ...baseUserData,
                    ...previousState,
                    stripeId: customerData?.stripeId,
                };
             });
         });


        // --- Stripe Subscription Listener ---
         subscriptionUnsubscribeRef.current = onCurrentUserSubscriptionUpdate(payments, async (snapshot) => {
             console.log(">>> useAuth: Stripe listener FIRED.");
             console.log("   Stripe snapshot raw:", JSON.stringify(snapshot, null, 2));

             let finalSubscription: SubscriptionStatus = 'free';
             let finalStripeRole: string | undefined = undefined;
             let finalIsAdmin = false;
             let finalUsage: UsageData | undefined = undefined;
             let finalClassroomUsage: UserData['classroomUsage'] = undefined; // For classroom credits
             let previousSubscription: SubscriptionStatus | undefined = undefined;


             let currentUserData: UserData | null = null;
              setUser(prev => {
                  currentUserData = prev;
                  previousSubscription = prev?.subscription;
                   // Initialize classroomUsage from previous state if it exists
                  finalClassroomUsage = prev?.classroomUsage;
                  return prev; // No state change here, just reading
              });


             finalIsAdmin = currentUserData?.isAdmin || currentUserData?.subscription === 'admin';


             if (finalIsAdmin) {
                 console.log("   Stripe listener: User is admin.");
                 finalSubscription = 'admin';
                 finalUsage = { credits: -1, lastReset: currentUserData?.usage?.lastReset || Date.now() };
                 // Admins don't have classroomUsage structure
                 finalClassroomUsage = undefined;
             } else {
                 // Non-admin user logic
                 if (snapshot && Array.isArray(snapshot.subscriptions) && snapshot.subscriptions.length > 0) {
                      // ... (sorting logic remains the same) ...
                      const newestActiveSubSnapshot = sortedSubs.find(sub => sub && ['active', 'trialing'].includes(sub.status));

                     if (newestActiveSubSnapshot) {
                         console.log("   Stripe listener: Found newest active sub:", newestActiveSubSnapshot.id);
                         try {
                              // ... (fetching sub doc logic remains the same) ...
                               if (subDocSnap.exists()) {
                                  // ... (getting role logic remains the same) ...
                                  // Prioritize metadata, fallback to role
                                  if (subData?.items?.[0]?.price?.product?.metadata?.stripeRole) {
                                      finalStripeRole = subData.items[0].price.product.metadata.stripeRole as string;
                                      console.log("   Role from metadata:", finalStripeRole);
                                  } else if (subData?.role) {
                                      finalStripeRole = subData.role;
                                      console.log("   Role from top-level:", finalStripeRole);
                                  } else {
                                      console.warn("   Could not find stripeRole in fetched Firestore doc:", newestActiveSubSnapshot.id);
                                  }
                              } else {
                                  console.warn("   Newest active subscription doc NOT FOUND in Firestore:", newestActiveSubSnapshot.id);
                              }
                         } catch (fetchError) { console.error("   Error fetching sub doc:", fetchError); }

                         finalSubscription = getSubscriptionStatus(finalStripeRole);
                         console.log(`   Determined Role='${finalStripeRole}', Status='${finalSubscription}'`);


                         if (finalSubscription === 'classroom') {
                             // --- Classroom Subscription Logic ---
                             console.log("   User has 'classroom' subscription.");
                             const isTeacher = currentUserData?.uid === userId; // Check if the current user is the teacher
                             const newTeacherCredits = getCreditsForSubscription('classroom', true);
                             const newStudentCredits = getCreditsForSubscription('classroom', false);
                             const now = Date.now();

                             // Initialize or reset teacher credits if needed
                             const currentTeacherUsage = finalClassroomUsage?.teacher;
                             const resetTeacher = !currentTeacherUsage || finalSubscription !== previousSubscription;
                             const teacherUsageUpdate = resetTeacher
                                 ? { credits: newTeacherCredits, lastReset: now }
                                 : currentTeacherUsage;

                             // Initialize or reset student credits (if structure exists)
                             const studentUsageUpdates: { [key: string]: UsageData } = {};
                              if (finalClassroomUsage?.students) {
                                  Object.keys(finalClassroomUsage.students).forEach(studentUid => {
                                      studentUsageUpdates[studentUid] = { credits: newStudentCredits, lastReset: now };
                                  });
                              }

                             finalClassroomUsage = {
                                teacher: teacherUsageUpdate,
                                students: studentUsageUpdates
                             };
                             finalUsage = undefined; // Individual usage not relevant for active classroom teacher

                              if (resetTeacher) {
                                 console.log(`   Resetting classroom credits for teacher ${userId}.`);
                                 // Update Firestore directly for classroom reset - might need adjustment if complex
                                 // For simplicity, we let checkAndDecrement handle daily resets now.
                                 // await updateDoc(doc(db, USERS_COLLECTION, userId), { classroomUsage: finalClassroomUsage });
                             }

                         } else if (finalSubscription !== previousSubscription) {
                             // --- Individual Subscription Change ---
                             console.log(`   Individual subscription changed from ${previousSubscription} to ${finalSubscription}. Resetting credits.`);
                             const newMaxCredits = getCreditsForSubscription(finalSubscription, false); // Not a teacher context
                             finalUsage = { credits: newMaxCredits, lastReset: Date.now() };
                             await updateUserUsage(userId, finalUsage); // Update individual usage
                             finalClassroomUsage = undefined; // Clear classroom usage if switching away
                         } else {
                             // No change in individual subscription type
                             finalUsage = currentUserData?.usage || defaultUsage;
                             finalClassroomUsage = undefined; // Ensure classroom usage is clear
                         }
                     } else {
                         // No *active* subscription found
                         console.log("   Stripe listener: No ACTIVE subscription found.");
                         finalSubscription = 'free';
                         finalUsage = currentUserData?.usage || defaultUsage;
                         finalClassroomUsage = undefined; // Clear classroom usage
                         if (previousSubscription && previousSubscription !== 'free' && previousSubscription !== 'admin') {
                              console.log(`   Subscription ended/inactive, falling back to 'free'. Resetting credits.`);
                              const newMaxCredits = getCreditsForSubscription('free');
                              finalUsage = { credits: newMaxCredits, lastReset: Date.now() };
                              await updateUserUsage(userId, finalUsage);
                         }
                     }
                 } else {
                     // No subscriptions array or empty array, and not admin
                     console.log("   Stripe listener: No subscriptions array/empty and not admin.");
                     finalSubscription = 'free';
                     finalUsage = currentUserData?.usage || defaultUsage;
                     finalClassroomUsage = undefined; // Clear classroom usage
                      if (previousSubscription && previousSubscription !== 'free' && previousSubscription !== 'admin') {
                          console.log(`   Subscription ended/missing, falling back to 'free'. Resetting credits.`);
                          const newMaxCredits = getCreditsForSubscription('free');
                          finalUsage = { credits: newMaxCredits, lastReset: Date.now() };
                          await updateUserUsage(userId, finalUsage);
                      }
                 }
             }

             // Final state update
             console.log("   Stripe listener: Updating final state -> isAdmin:", finalIsAdmin, "subscription:", finalSubscription, "role:", finalStripeRole);
             setUser(prev => ({
                ...baseUserData,
                stripeId: prev?.stripeId,
                // Apply definitive status from this listener
                isAdmin: finalIsAdmin,
                subscription: finalSubscription,
                stripeRole: finalStripeRole,
                usage: finalUsage, // Might be undefined if classroom sub is active
                classroomUsage: finalClassroomUsage // Might be undefined if individual sub is active
             }));


             console.log("   Stripe listener: Setting setLoading = false");
             setLoading(false); // Final loading state set here
         }); // End Stripe Listener

      } else {
        // User is signed out
        console.log("useAuth: Auth state changed: User signed out.");
        setUser(null);
        setLoading(false);
      }
    }); // End of Auth listener

    // Main cleanup
    return () => {
        console.log("useAuth: Cleaning up auth listener and Firestore listeners."); // DEBUG
        unsubscribeAuth();
        userUnsubscribeRef.current();
        customerUnsubscribeRef.current();
        subscriptionUnsubscribeRef.current();
    };
  }, []); // End of useEffect

  return { user, loading };
}; // End of useAuth