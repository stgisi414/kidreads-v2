import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions();

export const generateStoryAndIllustration = httpsCallable(
  functions,
  "generateStoryAndIllustration"
);
export const getPhonemesForWord = httpsCallable(
  functions,
  "getPhonemesForWord"
);