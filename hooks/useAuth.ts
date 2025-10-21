// hooks/useAuth.ts

import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, getDoc, collection, updateDoc,
    query, where, limit, getDocs } from "firebase/firestore";
import { auth, db, payments } from '../firebase';
import { UserData, SubscriptionStatus, UsageData } from '../types';
import { onCurrentUserSubscriptionUpdate, Subscription } from '@invertase/firestore-stripe-payments';

export const getCreditsForSubscription = (subscription: SubscriptionStatus, isTeacher: boolean = false): number => { // <-- Add export
  switch (subscription) {
    case 'inactive': return 0;
    case 'admin': return -1; // Unlimited
    case 'classroom': return isTeacher ? 30 : 10;
    case 'lite': return 10;
    case 'max': return 25;
    default: return 5; // Free
  }
};

// Helper function to determine subscription status from Stripe role
const getSubscriptionStatus = (stripeRole: string | undefined): SubscriptionStatus => {
  if (stripeRole === 'lite') return 'lite';
  if (stripeRole === 'max') return 'max';
  if (stripeRole === 'admin') return 'admin';
  if (stripeRole === 'classroom') return 'classroom';
  return 'free';
};

// Default usage data for new users or fallback
export const defaultUsage: UsageData = { credits: 5, lastReset: 0 };

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

const CLASSROOMS_COLLECTION = 'classrooms';

export const useAuth = () => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  // Refs to hold unsubscribe functions for listeners
  const userUnsubscribeRef = useRef(() => {});
  const customerUnsubscribeRef = useRef(() => {});
  const subscriptionUnsubscribeRef = useRef(() => {});

    useEffect(() => {
    console.log("useAuth: Effect started.");

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser: User | null) => { // Make async
      // Cleanup previous listeners first
      userUnsubscribeRef.current();
      customerUnsubscribeRef.current();
      subscriptionUnsubscribeRef.current();
      setUser(null); // Reset user state
      setLoading(true);
      console.log("useAuth: Auth state changed. User:", firebaseUser?.uid || 'null');

      if (firebaseUser) {
        const userId = firebaseUser.uid;
        const userEmail = firebaseUser.email; // Get email
        const userRef = doc(db, 'users', userId);
        const customerRef = doc(db, 'customers', userId);
        const subscriptionsRef = collection(db, 'customers', userId, 'subscriptions');

        // Define base user data *fully* from auth
        const baseUserData: UserData = {
            uid: userId,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            isAdmin: false, // Default
            subscription: 'free', // Default
            usage: defaultUsage, // Default
            stripeId: undefined, // Default
            stripeRole: undefined, // Default
            classroomUsage: undefined // Default
        };
        // Set initial state immediately
        setUser(baseUserData);
        console.log("useAuth: Initial base user state set:", JSON.stringify(baseUserData, null, 2));

        let studentCheckCompleted = false; // Flag to manage loading state

        // --- User Document Listener ---
        userUnsubscribeRef.current = onSnapshot(userRef, (userDoc) => {
            console.log(">>> useAuth: userDoc listener FIRED.");
            const userData = userDoc.data() as UserData | undefined;
            setUser(prev => {
                // If student check already set classroom status, don't revert to free based on student's own doc
                // AVOID overwriting subscription/usage based on student's own potentially outdated doc.
                if (studentCheckCompleted && prev?.subscription === 'classroom' && userData?.subscription !== 'classroom') {
                   console.log("   UserDoc listener: Skipping subscription/usage update, student check completed and set classroom.");
                   // Only update non-critical fields like preferences, display name, photo URL if they changed
                   return {
                       ...(prev || baseUserData), // Keep the existing state (incl. classroom subscription/usage)
                       // Selectively update fields that *should* come from the user's own doc
                       preferences: userData?.preferences ?? prev?.preferences,
                       displayName: userData?.displayName ?? baseUserData.displayName, // Update if changed
                       photoURL: userData?.photoURL ?? baseUserData.photoURL, // Update if changed
                       // Explicitly DO NOT update: subscription, usage, classroomUsage, isAdmin, stripeRole here
                   };
                }

                // Normal update if not a student or before student check runs
                const previousState = prev || baseUserData;
                const isAdmin = userData?.isAdmin ?? previousState.isAdmin ?? false;
                let subscription = userData?.subscription ?? previousState.subscription ?? 'free';
                if (isAdmin) subscription = 'admin';

                console.log("   UserDoc listener: Updating state normally.");
                return {
                    ...baseUserData,
                    ...previousState,
                    isAdmin: isAdmin,
                    subscription: subscription,
                    usage: userData?.usage ?? previousState.usage ?? defaultUsage,
                    preferences: userData?.preferences ?? previousState.preferences,
                    classroomUsage: userData?.classroomUsage ?? previousState.classroomUsage,
                };
            });
             if (!studentCheckCompleted && !userEmail) { // Only stop loading if student check won't run
                setLoading(false);
                console.log("   UserDoc listener: Setting loading=false (no email for student check).");
            }
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

        // --- START STUDENT CHECK ---
        if (userEmail) {
            console.log(`useAuth: Checking if user ${userId} (${userEmail}) is a student.`);
            const classroomsRef = collection(db, CLASSROOMS_COLLECTION);
            const studentQuery = query(
                classroomsRef,
                where("students", "array-contains", userEmail),
                where("subscriptionStatus", "==", "active"), // Only check active classrooms
                limit(1)
            );

            try {
                const studentSnap = await getDocs(studentQuery);
                if (!studentSnap.empty) {
                    const classroomDoc = studentSnap.docs[0];
                    const teacherUid = classroomDoc.id;
                    console.log(`   User is a student in active classroom of teacher ${teacherUid}.`);

                    const teacherUserRef = doc(db, 'users', teacherUid);
                    const teacherDocSnap = await getDoc(teacherUserRef);

                    if (teacherDocSnap.exists()) {
                        const teacherData = teacherDocSnap.data() as UserData;
                        const studentUsageData = teacherData.classroomUsage?.students?.[userId];

                        if (studentUsageData) {
                            console.log("   Found student usage data under teacher:", studentUsageData);
                            setUser(prev => ({
                                ...baseUserData,
                                ...(prev || {}),
                                subscription: 'classroom',
                                stripeRole: 'classroom', // Assign role explicitly
                                usage: studentUsageData, // IMPORTANT: Use student-specific usage
                                classroomUsage: undefined, // Clear any potential teacher usage data
                                isAdmin: false // Ensure student is not admin
                            }));
                        } else {
                            console.warn(`   Student usage data not found under teacher ${teacherUid} for student ${userId}. Setting default student credits.`);
                             setUser(prev => ({
                                ...baseUserData,
                                ...(prev || {}),
                                subscription: 'classroom',
                                stripeRole: 'classroom',
                                usage: { credits: getCreditsForSubscription('classroom', false), lastReset: 0 }, // Apply default student credits
                                classroomUsage: undefined,
                                isAdmin: false
                             }));
                        }
                    } else {
                         console.warn(`   Teacher user document (${teacherUid}) not found. Keeping user as free tier.`);
                         // If teacher doc missing, student reverts to free effectively
                         // No state change needed here, default 'free' remains.
                    }
                    studentCheckCompleted = true; // Mark student check as done
                    setLoading(false); // Stop loading *after* student status confirmed
                    console.log("   Student check complete. Set loading=false.");

                } else {
                     console.log("   User is not found as a student in any active classroom.");
                     studentCheckCompleted = true; // Mark as done even if not found
                }
            } catch (error) {
                console.error("   Error checking student status:", error);
                studentCheckCompleted = true; // Mark as done even on error
            }
        } else {
            studentCheckCompleted = true; // No email, student check can't run
        }

        // --- Stripe Subscription Listener ---
         subscriptionUnsubscribeRef.current = onCurrentUserSubscriptionUpdate(payments, async (snapshot) => {
             console.log(">>> useAuth: Stripe listener FIRED."); // Existing log
             console.log("   Stripe snapshot raw:", JSON.stringify(snapshot, null, 2)); // Existing log

             let finalSubscription: SubscriptionStatus = 'free';
             let finalStripeRole: string | undefined = undefined;
             let finalIsAdmin = false;
             let finalUsage: UsageData | undefined = undefined;
             let finalClassroomUsage: UserData['classroomUsage'] = undefined;
             let previousSubscription: SubscriptionStatus | undefined = undefined;

             let currentUserData: UserData | null = null;
              setUser(prev => {
                  currentUserData = prev;
                  previousSubscription = prev?.subscription;
                  finalClassroomUsage = prev?.classroomUsage;
                  // DEBUG: Log previous state here
                  console.log("   PREVIOUS User State before Stripe update:", JSON.stringify(prev, null, 2));
                  return prev;
              });

             finalIsAdmin = currentUserData?.isAdmin || currentUserData?.subscription === 'admin';

             if (finalIsAdmin) {
                 console.log("   Stripe listener: User is admin."); // Existing log
                 finalSubscription = 'admin';
                 finalUsage = { credits: -1, lastReset: currentUserData?.usage?.lastReset || Date.now() };
                 finalClassroomUsage = undefined;
             } else {
                 if (snapshot && Array.isArray(snapshot.subscriptions) && snapshot.subscriptions.length > 0) {
                      const sortedSubs = snapshot.subscriptions.sort(
                          (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
                      );
                      const newestActiveSubSnapshot = sortedSubs.find(sub => sub && ['active', 'trialing'].includes(sub.status));

                      if (newestActiveSubSnapshot) {
                           console.log("   Stripe listener: Found newest active sub:", newestActiveSubSnapshot.id);

                           let subDocSnap: DocumentSnapshot<DocumentData> | null = null; // Declare outside try

                           try {
                                const subDocRef = doc(subscriptionsRef, newestActiveSubSnapshot.id);
                                subDocSnap = await getDoc(subDocRef); // Assign inside try

                                // Now check subDocSnap *inside* the try block after fetching
                                if (subDocSnap.exists()) {
                                    const subData = subDocSnap.data();
                                    console.log("   Fetched Firestore sub doc data:", JSON.stringify(subData, null, 2)); // DEBUG Log

                                    const roleFromMetadata = subData?.items?.[0]?.price?.product?.metadata?.stripeRole;
                                    const roleFromTopLevel = subData?.role;
                                    console.log("   DEBUG: Role read from metadata path:", roleFromMetadata); // DEBUG Log
                                    console.log("   DEBUG: Role read from top-level path:", roleFromTopLevel); // DEBUG Log

                                    // Check metadata first, then fallback to top-level role
                                    if (roleFromMetadata) {
                                        finalStripeRole = roleFromMetadata as string;
                                        console.log("   Using Role from metadata:", finalStripeRole);
                                    } else if (roleFromTopLevel) {
                                        finalStripeRole = roleFromTopLevel;
                                        console.log("   Using Role from top-level:", finalStripeRole);
                                    } else {
                                        console.warn("   Could not find stripeRole in fetched Firestore doc:", newestActiveSubSnapshot.id);
                                    }
                                } else {
                                    console.warn("   Newest active subscription doc NOT FOUND in Firestore:", newestActiveSubSnapshot.id);
                                }
                           // -------- START FIX --------
                           } catch (fetchError) {
                              // The catch block now correctly follows the try block
                              console.error("   Error fetching sub doc:", fetchError);
                           }
                           // -------- END FIX --------

                           // Determine finalSubscription based on finalStripeRole *after* the try...catch
                           finalSubscription = getSubscriptionStatus(finalStripeRole);
                           console.log(`   DEBUG: Determined finalStripeRole='${finalStripeRole}', calculated finalSubscription='${finalSubscription}'`); // DEBUG Log


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
             // -------- START DEBUG LOGGING --------
             console.log(`   DEBUG: Preparing final setUser update. isAdmin: ${finalIsAdmin}, subscription: ${finalSubscription}, stripeRole: ${finalStripeRole}`);
             const newState = {
                ...baseUserData, // Make sure you have baseUserData defined with auth info
                stripeId: currentUserData?.stripeId, // Carry over stripeId
                isAdmin: finalIsAdmin,
                subscription: finalSubscription,
                stripeRole: finalStripeRole,
                usage: finalUsage,
                classroomUsage: finalClassroomUsage
             };
             console.log("   DEBUG: Final state object to be set:", JSON.stringify(newState, null, 2));
             // -------- END DEBUG LOGGING --------

             setUser(newState); // Actual state update


             // Only set loading false if the student check didn't already
             if (!studentCheckCompleted) {
                console.log("   Stripe listener: Setting setLoading = false");
                setLoading(false);
             } else {
                console.log("   Stripe listener: Skipping setLoading=false, student check handled it or doesn't apply.");
             }
         }); // End Stripe Listener

          setTimeout(() => {
             // Use a function form of setLoading to avoid race conditions if needed
             setLoading(prevLoading => {
                 if (prevLoading) { // Only set to false if it's still true
                     console.log("useAuth: Setting loading=false (timeout fallback).");
                     return false;
                 }
                 return prevLoading;
             });
         }, 2500);

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