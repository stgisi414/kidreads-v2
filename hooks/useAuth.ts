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
  return 'free';
};

// Helper function to get the credit limit for a subscription status
const getCreditsForSubscription = (subscription: SubscriptionStatus): number => {
  if (subscription === 'inactive') return 0;
  if (subscription === 'admin') return -1; // Unlimited represented as -1
  if (subscription === 'lite') return 10;
  if (subscription === 'max') return 25;
  return 5; // Default for 'free'
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
            console.log(">>> useAuth: userDoc listener FIRED."); // DEBUG
            const userData = userDoc.data() as UserData | undefined;
            console.log("   userDoc data:", userData); // DEBUG
            setUser(prev => {
                // Ensure prev is not null before merging
                const previousState = prev || baseUserData;
                return {
                    // Start with guaranteed base data
                    ...baseUserData,
                    // Merge previous state (important for stripeId/Role if other listeners ran)
                    ...previousState,
                    // Update with specific fields from this listener
                    isAdmin: userData?.isAdmin || false,
                    usage: userData?.usage || defaultUsage,
                    // Update subscription only if admin status changed here, otherwise keep prev state's sub
                    subscription: (userData?.isAdmin) ? 'admin' : previousState.subscription,
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

        // Listener 2: Customer Document (updates stripeId)
        console.log("useAuth: Setting up customerDoc listener for", userId); // DEBUG
        customerUnsubscribeRef.current = onSnapshot(customerRef, (customerDoc) => {
             console.log(">>> useAuth: customerDoc listener FIRED."); // DEBUG
             const customerData = customerDoc.data();
             console.log("   customerDoc data:", customerData); // DEBUG
             setUser(prev => {
                 // Ensure prev is not null before merging
                const previousState = prev || baseUserData;
                return {
                    // Start with guaranteed base data
                    ...baseUserData,
                    // Merge previous state
                     ...previousState,
                    // Update with specific fields from this listener
                    stripeId: customerData?.stripeId,
                };
             });
         });

        // Listener 3: Stripe Subscriptions (determines definitive subscription status)
        console.log("useAuth: Setting up Stripe subscription listener for", userId); // DEBUG
        subscriptionUnsubscribeRef.current = onCurrentUserSubscriptionUpdate(payments, async (snapshot) => {
          console.log(">>> useAuth: Stripe listener FIRED."); // DEBUG
          console.log("   Stripe snapshot raw:", JSON.stringify(snapshot, null, 2)); // DEBUG

          let finalSubscription: SubscriptionStatus = 'free';
          let finalStripeRole: string | undefined = undefined;
          let finalIsAdmin = false;
          let finalUsage: UsageData | undefined = undefined;
          let previousSubscription: SubscriptionStatus | undefined = undefined;

          // Read current state to check isAdmin and get previous usage/sub
          let currentUserData: UserData | null = null;
          setUser(prev => {
              currentUserData = prev;
              previousSubscription = prev?.subscription;
              return prev; // No state change here, just reading
          });

          // Determine admin status (prioritize current state)
          finalIsAdmin = currentUserData?.isAdmin || currentUserData?.subscription === 'admin';

          if (finalIsAdmin) {
              console.log("   Stripe listener: User is admin.");
              finalSubscription = 'admin';
              finalUsage = { credits: -1, lastReset: currentUserData?.usage?.lastReset || Date.now() };
          } else {
              // Check for active subscription only if not admin
              if (snapshot && Array.isArray(snapshot.subscriptions) && snapshot.subscriptions.length > 0) {
                  const sortedSubs = [...snapshot.subscriptions].sort((a, b) => {
                      const dateA = a.created?.toDate ? a.created.toDate().getTime() : 0;
                      const dateB = b.created?.toDate ? b.created.toDate().getTime() : 0;
                      return dateB - dateA;
                  });
                  const newestActiveSubSnapshot = sortedSubs.find(sub => sub && ['active', 'trialing'].includes(sub.status));

                  if (newestActiveSubSnapshot) {
                      console.log("   Stripe listener: Found newest active sub:", newestActiveSubSnapshot.id);
                      try {
                          const subDocRef = doc(subscriptionsRef, newestActiveSubSnapshot.id);
                          const subDocSnap = await getDoc(subDocRef);
                          if (subDocSnap.exists()) {
                              const subData = subDocSnap.data() as Subscription;
                              console.log("   Stripe listener: Fetched Firestore sub doc:", subData);
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

                      // --- Credit Reset Logic ---
                      if (finalSubscription !== previousSubscription) {
                          console.log(`   Subscription changed from ${previousSubscription} to ${finalSubscription}. Resetting credits.`);
                          const newMaxCredits = getCreditsForSubscription(finalSubscription);
                          finalUsage = { credits: newMaxCredits, lastReset: Date.now() };
                          await updateUserUsage(userId, finalUsage); // Update Firestore
                      } else {
                          finalUsage = currentUserData?.usage || defaultUsage; // Keep existing if no change
                      }
                  } else {
                      // No *active* subscription found
                      console.log("   Stripe listener: No ACTIVE subscription found.");
                      finalSubscription = 'free';
                      finalUsage = currentUserData?.usage || defaultUsage;
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
                   if (previousSubscription && previousSubscription !== 'free' && previousSubscription !== 'admin') {
                       console.log(`   Subscription ended/missing, falling back to 'free'. Resetting credits.`);
                       const newMaxCredits = getCreditsForSubscription('free');
                       finalUsage = { credits: newMaxCredits, lastReset: Date.now() };
                       await updateUserUsage(userId, finalUsage);
                   }
              }
          }

          // Final state update based on this listener's findings
          console.log("   Stripe listener: Updating final state -> isAdmin:", finalIsAdmin, "subscription:", finalSubscription, "role:", finalStripeRole); // DEBUG
          setUser(prev => ({
             // Always start with the guaranteed firebaseUser details from baseUserData
             ...baseUserData,
             // Merge previous state ONLY for fields not definitively set here (like stripeId)
             stripeId: prev?.stripeId,
             // Apply definitive status from this listener
             isAdmin: finalIsAdmin,
             subscription: finalSubscription,
             stripeRole: finalStripeRole,
             usage: finalUsage || defaultUsage, // Ensure usage is always defined
          }));

          console.log("   Stripe listener: Setting setLoading = false"); // DEBUG
          setLoading(false); // Final loading state set here
        }); // End of Stripe listener

      } else {
        // User is signed out
        console.log("useAuth: Auth state changed: User signed out."); // DEBUG
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