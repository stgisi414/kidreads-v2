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