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

  // Improved regex to avoid splitting on known abbreviations.
  const regex = new RegExp(`(?<!\\b(${Array.from(abbreviations).join('|')}))[.!?]\\s+`, 'g');
  
  // First, we split the text into parts using the improved regex.
  // Then, we'll reconstruct the sentences to ensure punctuation is correctly placed.
  const sentences = text.replace(regex, '$&\u2028').split('\u2028');

  // Trim each sentence and filter out any empty strings that might result from the split.
  return sentences.map(s => s.trim()).filter(Boolean);
};