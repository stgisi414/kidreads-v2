import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase"; // Corrected import path

export const generateStoryAndIllustration = httpsCallable(
  functions,
  "generateStoryAndIllustration"
);

export const getPhonemesForWord = httpsCallable(
  functions,
  "getPhonemesForWord"
);