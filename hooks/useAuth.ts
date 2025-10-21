import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserData, SubscriptionStatus, UsageData } from '../types';
import { onCurrentUserSubscriptionUpdate } from '@invertase/firestore-stripe-payments';
import { payments } from '../firebase'; // We will add this export

const getSubscriptionStatus = (stripeRole: string | undefined): SubscriptionStatus => {
  if (stripeRole === 'lite') return 'lite';
  if (stripeRole === 'max') return 'max';
  return 'free';
};

const defaultUsage: UsageData = {
  credits: 5,
  lastReset: 0,
};

export const useAuth = () => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser: User | null) => {
      if (firebaseUser) {
        // User is signed in, now listen for Firestore data
        const userRef = doc(db, 'users', firebaseUser.uid);
        const customerRef = doc(db, 'customers', firebaseUser.uid);

        let userUnsubscribe = () => {};
        let customerUnsubscribe = () => {};
        let subscriptionUnsubscribe = () => {};

        // Listen for user data (credits, etc.)
        userUnsubscribe = onSnapshot(userRef, (userDoc) => {
          const userData = userDoc.data();
          
          setUser((prevUser) => ({
            ...prevUser,
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            usage: userData?.usage || defaultUsage,
            // Keep subscription info from other listeners
            subscription: prevUser?.subscription || 'free',
            stripeId: prevUser?.stripeId,
            stripeRole: prevUser?.stripeRole,
          }));
        });

        // Listen for Stripe customer data (stripeId)
        customerUnsubscribe = onSnapshot(customerRef, (customerDoc) => {
          const customerData = customerDoc.data();
          setUser((prevUser) => ({
            ...prevUser,
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            usage: prevUser?.usage || defaultUsage,
            stripeId: customerData?.stripeId,
            // Keep subscription info from other listeners
            subscription: prevUser?.subscription || 'free',
            stripeRole: prevUser?.stripeRole,
          }));
        });

        // Listen for active subscriptions
        subscriptionUnsubscribe = onCurrentUserSubscriptionUpdate(payments, (snapshot) => {
          if (snapshot.subscriptions.length === 0) {
            setUser((prevUser) => ({
              ...prevUser,
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              usage: prevUser?.usage || defaultUsage,
              stripeRole: undefined,
              subscription: 'free',
            }));
            setLoading(false);
            return;
          }

          // Assuming one subscription
          const sub = snapshot.subscriptions[0];
          const stripeRole = sub.role || sub.items[0]?.price.product.metadata.stripeRole as string;
          const status = getSubscriptionStatus(stripeRole);

          setUser((prevUser) => ({
            ...prevUser,
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            usage: prevUser?.usage || defaultUsage,
            stripeRole: stripeRole,
            subscription: status,
          }));
          setLoading(false);
        });

        return () => {
          userUnsubscribe();
          customerUnsubscribe();
          subscriptionUnsubscribe();
        };

      } else {
        // User is signed out
        setUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  return { user, loading };
};