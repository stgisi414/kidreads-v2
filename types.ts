
export enum ReadingMode {
  WORD = 'Word',
  SENTENCE = 'Sentence',
  PHONEME = 'Phoneme',
}

export type Story = {
  text: string;
  illustration: string;
  sentences: string[];
  words: string[];
  phonemes: Record<string, string[]>;
};
