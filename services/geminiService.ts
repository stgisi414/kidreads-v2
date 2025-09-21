import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase"; // This now imports from your new firebase.ts

// Creates a reference to the 'generateStoryAndIllustration' Firebase Function
export const generateStoryAndIllustration = httpsCallable(
  functions,
  "generateStoryAndIllustration"
);

// Creates a reference to the 'getPhonemesForWord' Firebase Function
export const getPhonemesForWord = httpsCallable(
  functions,
  "getPhonemesForWord"
);