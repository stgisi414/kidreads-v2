import React, { useState, useCallback, useEffect } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import * as Tone from "tone";
import type { Story } from "./types";
import HomeScreen from "./components/HomeScreen";
import StoryScreen from "./components/StoryScreen";
import Header from "./components/Header";
import { generateStoryAndIllustration } from "./services/geminiService";
import {
  getUserPreferences,
  updateUserPreferences,
} from "./services/firestoreService";
import Spinner from "./components/Spinner";
import { splitSentences } from "./utils/textUtils";
import ErrorBoundary from "./components/ErrorBoundary";
import ShareStoryScreen from "./components/ShareStoryScreen";

type Screen = "home" | "story" | "share";

const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>("home");
  const [story, setStory] = useState<Story | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isInitiallySaved, setIsInitiallySaved] = useState(false);

  // Set a default voice state, which will be updated from Firestore   or localStorage
  const [voice, setVoice] = useState<string>("Leda");
  const [speakingRate, setSpeakingRate] = useState<number>(1.0);

  useEffect(() => {
    if (window.location.pathname.startsWith('/story/')) {
      setScreen("share");
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const prefs = await getUserPreferences(currentUser.uid);
        if (prefs.voice) {
          setVoice(prefs.voice);
        } else {
          const localVoice = localStorage.getItem("selectedVoice") || "Leda";
          setVoice(localVoice);
        }
        if (prefs.speakingRate) {
          setSpeakingRate(prefs.speakingRate);
        } else {
          const localRate = parseFloat(
            localStorage.getItem("speakingRate") || "1.0"
          );
          setSpeakingRate(localRate);
        }
      } else {
        setVoice(localStorage.getItem("selectedVoice") || "Leda");
        setSpeakingRate(
          parseFloat(localStorage.getItem("speakingRate") || "1.0")
        );
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (screen === "share") {
    return (
      <div className="min-h-screen w-full flex flex-col items-center p-4 bg-sky-50 text-slate-800">
        <Header onGoHome={handleGoHome} user={user} />
        <main className="w-full max-w-4xl mx-auto flex-grow flex items-center justify-center">
            <ErrorBoundary>
                <ShareStoryScreen user={user} />
            </ErrorBoundary>
        </main>
      </div>
    );
  }

  const handleVoiceChange = useCallback(
    (newVoice: string) => {
      setVoice(newVoice);
      // Always save to localStorage immediately for logged-out users or fallback
      localStorage.setItem("selectedVoice", newVoice);
      // Only save to Firestore if the user is logged in.
      if (user) {
        updateUserPreferences(user.uid, { voice: newVoice });
      }
    },
    [user]
  );

  const handleSpeakingRateChange = useCallback(
    (newRate: number) => {
      setSpeakingRate(newRate);
      localStorage.setItem("speakingRate", newRate.toString());
      if (user) {
        updateUserPreferences(user.uid, { speakingRate: newRate });
      }
    },
    [user]
  );

  const handleCreateStory = useCallback(async (topic: string) => {
    if (Tone.context.state !== "running") {
      await Tone.start();
    }

    setIsLoading(true);
    setLoadingMessage("Thinking of a wonderful story...");
    setError(null);
    try {
      const { title, text, illustration, quiz } =
        await generateStoryAndIllustration(topic);

      const sentences = splitSentences(text);
      const words = text.split(/\s+/).filter((w) => w.length > 0);

      setStory({
        id: Date.now(),
        title,
        text,
        illustration,
        sentences: sentences.map((s) => s.trim()),
        words: words,
        phonemes: {},
        quiz,
      });
      setIsInitiallySaved(false); // A new story is not saved
      setScreen("story");
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Oops! I couldn't create a story. Please try again."
      );
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  }, []);

  const handleGoHome = useCallback(() => {
    // Navigate to the root URL if on the share screen
    if (screen === 'share') {
      window.location.href = '/';
    } else {
      setStory(null);
      setScreen("home");
      setError(null);
    }
  }, [screen]);

  const handleLoadStory = useCallback(async (storyToLoad: Story) => {
    if (Tone.context.state !== "running") {
      await Tone.start();
    }
    setStory(storyToLoad);
    setIsInitiallySaved(true); // A loaded story is already saved
    setScreen("story");
  }, []);

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-4 bg-sky-50 text-slate-800">
      {screen === "story" && <Header onGoHome={handleGoHome} user={user} />}
      <main className="w-full max-w-4xl mx-auto flex-grow flex items-center justify-center">
        {authLoading ? (
          <Spinner message="Loading your profile..." />
        ) : screen === "home" ? (
          <ErrorBoundary>
            <HomeScreen
              user={user}
              onCreateStory={handleCreateStory}
              onLoadStory={handleLoadStory}
              isLoading={isLoading}
              loadingMessage={loadingMessage}
              error={error}
              voice={voice}
              onVoiceChange={handleVoiceChange}
              speakingRate={speakingRate}
              onSpeakingRateChange={handleSpeakingRateChange}
              setError={setError}
            />
          </ErrorBoundary>
        ) : (
          story && (
            <ErrorBoundary>
              <StoryScreen
                user={user}
                story={story}
                onGoHome={handleGoHome}
                voice={voice}
                speakingRate={speakingRate}
                isInitiallySaved={isInitiallySaved}
              />
            </ErrorBoundary>
          )
        )}
      </main>
    </div>
  );
};

export default App;