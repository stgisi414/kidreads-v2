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
  usage?: UsageData; // Individual usage might be undefined/unused if classroom applies
  isAdmin?: boolean;
  stripeId?: string;
  stripeRole?: string; // This might be 'classroom'
  // Usage data specific to classroom members, stored on the TEACHER's user document
  classroomUsage?: {
    teacher?: UsageData;
    students?: {
      [studentUid: string]: UsageData;
    };
  };
  preferences?: { // Added preferences structure
     voice?: string;
     speakingRate?: number;
     storyLength?: number;
  };
  createdAt?: any; // Added createdAt from authService
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