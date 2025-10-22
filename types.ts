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

export type SubscriptionStatus = "free" | "lite" | "max" | "inactive" | "admin" | "classroom";

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
  usage?: UsageData;
  isAdmin?: boolean;
  stripeId?: string;
  stripeRole?: string;
  // Usage data specific to classroom members, stored on the TEACHER's user document
  classroomUsage?: {
    teacher?: UsageData;
    students?: {
      [studentUid: string]: UsageData;
    };
  };
  preferences?: {
     voice?: string;
     speakingRate?: number;
     storyLength?: number;
  };
  createdAt?: any;
  memberOfClassroom?: string | null; // <-- ADD THIS FIELD (teacher's UID or null)
}

// Interface for Classroom document
export interface ClassroomData {
    teacherUid: string;
    teacherEmail: string;
    subscriptionStatus: 'active' | 'inactive' | 'cancelled'; // Reflect Stripe status
    stripeSubscriptionId?: string;
    students: string[]; // Array of student emails
    createdAt: Timestamp;
    updatedAt: Timestamp;
}