import React, { useState, useCallback } from 'react';
import type { Story } from './types';
import HomeScreen from './components/HomeScreen';
import StoryScreen from './components/StoryScreen';
import Header from './components/Header'; 
import { generateStoryAndIllustration } from './services/geminiService';

type Screen = 'home' | 'story';

const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('home');
  const [story, setStory] = useState<Story | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleCreateStory = useCallback(async (topic: string) => {
    setIsLoading(true);
    setLoadingMessage('Thinking of a wonderful story...');
    setError(null);
    try {
      const { title, text, illustration, quiz } = await generateStoryAndIllustration(topic);
      
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const words = text.split(/\s+/).filter(w => w.length > 0);

      setStory({
        id: Date.now(),
        text,
        illustration,
        sentences: sentences.map(s => s.trim()),
        words: words,
        phonemes: {},
        quiz,
      });
      setScreen('story');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Oops! I couldn\'t create a story. Please try again.');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, []);

  const handleGoHome = useCallback(() => {
    setStory(null);
    setScreen('home');
    setError(null);
  }, []);

  const handleLoadStory = useCallback((storyToLoad: Story) => {
    setStory(storyToLoad);
    setScreen('story');
  }, []);

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-4 bg-sky-50 text-slate-800">
      {screen === 'story' && <Header onGoHome={handleGoHome} />}
      <main className="w-full max-w-4xl mx-auto flex-grow flex items-center justify-center">
        {screen === 'home' && (
          <HomeScreen
            onCreateStory={handleCreateStory}
            onLoadStory={handleLoadStory}
            isLoading={isLoading}
            loadingMessage={loadingMessage}
            error={error}
          />
        )}
        {screen === 'story' && story && (
          <StoryScreen story={story} onGoHome={handleGoHome} />
        )}
      </main>
    </div>
  );
};

export default App;