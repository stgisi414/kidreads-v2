// stgisi414/kidreads-v2/kidreads-v2-8bd0e3e22cb8d0dfac35f8173b1686472fe040f8/utils/textUtils.ts
const abbreviations = new Set([
  'Dr', 'Mr', 'Mrs', 'Ms', 'Jr', 'Sr', 'St', 'Ave', 'Blvd', 'Capt', 'Col', 'Gen', 'Gov', 'Lt', 'Pres', 'Rep', 'Rev', 'Sgt'
]);

/**
 * Splits a text into sentences, handling common abbreviations.
 * @param text The text to split.
 * @returns An array of sentences.
 */
export const splitSentences = (text: string): string[] => {
  if (!text) return [];

  const sentences = text.split(/(?<!\b(?:Dr|Mr|Mrs|Ms|Jr|Sr)\.)\s*([.!?])\s*/g);
  
  const result: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    let sentence = sentences[i];
    const punctuation = sentences[i + 1];
    if (sentence && punctuation) {
      sentence += punctuation;
    }
    if (sentence) {
      result.push(sentence.trim());
    }
  }
  
  return result.length > 0 ? result : [text];
};