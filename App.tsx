// stgisi414/kidreads-v2/kidreads-v2-5a75318aefcd07c9007480bfe0f89caabf4d23fb/App.tsx
// stgisi414/kidreads-v2/kidreads-v2-481bdc4553ad75bdafafd2b9a8d9541c82717d7f/App.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { auth } from './firebase';
import * as Tone from 'tone';
import type { Story } from './types';
import HomeScreen from './components/HomeScreen';
import StoryScreen from './components/StoryScreen';
import Header from './components/Header';
import { generateStoryAndIllustration } from './services/geminiService';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';

type Screen = 'home' | 'story';

const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('home');
  const [story, setStory] = useState<Story | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isInitiallySaved, setIsInitiallySaved] = useState(false); // <-- Add this state

  const [voice, setVoice] = useState<string>(() => {
    return localStorage.getItem('selectedVoice') || 'Leda';
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem('selectedVoice', voice);
  }, [voice]);

  const handleCreateStory = useCallback(async (topic: string) => {
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }
    
    setIsLoading(true);
    setLoadingMessage('Thinking of a wonderful story...');
    setError(null);
    try {
      const { title, text, illustration, quiz } = await generateStoryAndIllustration(topic);
      
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const words = text.split(/\s+/).filter(w => w.length > 0);

      setStory({
        id: Date.now(),
        title,
        text,
        illustration,
        sentences: sentences.map(s => s.trim()),
        words: words,
        phonemes: {},
        quiz,
      });
      setIsInitiallySaved(false); // A new story is not saved
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

  const handleLoadStory = useCallback(async (storyToLoad: Story) => {
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }
    setStory(storyToLoad);
    setIsInitiallySaved(true); // A loaded story is already saved
    setScreen('story');
  }, []);

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-4 bg-sky-50 text-slate-800">
      {screen === 'story' && <Header onGoHome={handleGoHome} user={user} />}
      <main className="w-full max-w-4xl mx-auto flex-grow flex items-center justify-center">
        {screen === 'home' && (
          <HomeScreen
            user={user}
            onCreateStory={handleCreateStory}
            onLoadStory={handleLoadStory}
            isLoading={isLoading}
            loadingMessage={loadingMessage}
            error={error}
            voice={voice}
            onVoiceChange={setVoice}
          />
        )}
        {screen === 'story' && story && (
          // Pass the new prop to StoryScreen
          <StoryScreen story={story} onGoHome={handleGoHome} voice={voice} user={user} isInitiallySaved={isInitiallySaved} />
        )}
      </main>
    </div>
  );
};

export default App;