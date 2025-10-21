export enum ReadingMode {
  WORD = 'Word',
  SENTENCE = 'Sentence',
  PHONEME = 'Phoneme',
  QUIZ = 'Quiz',
}

export type QuizQuestion = {
  question: string;
  options: string[];
  answer: string;
};

export type QuizResult = {
  score: number;
  date: string;
  answers: { question: string; selected: string; correct: string }[];
};

export type Story = {
  id: number;
  title: string;
  text: string;
  illustration: string;
  sentences: string[];
  words: string[];
  phonemes: Record<string, string[]>;
  quiz: QuizQuestion[];
  quizResults?: QuizResult;
};

export type SubscriptionStatus = "free" | "lite" | "max" | "inactive" | "admin";

export interface UsageData {
  credits: number;
  lastReset: number; // Timestamp
}

export interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  subscription: SubscriptionStatus;
  usage: UsageData;
  // This mirrors the structure from langcampus-exchange's useAuth
  stripeId?: string;
  stripeRole?: string;
  isAdmin?: boolean;
}