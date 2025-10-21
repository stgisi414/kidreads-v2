import React, { useState, useCallback, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import type { User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged } from "firebase/auth";
import {
  createCheckoutSession,
} from "@invertase/firestore-stripe-payments";
import { auth, functions, payments } from "./firebase";
import { useAuth } from "./hooks/useAuth";
import * as Tone from "tone";
import type { Story } from "./types";
import HomeScreen from "./components/HomeScreen";
import StoryScreen from "./components/StoryScreen";
import Header from "./components/Header";
import { generateStoryAndIllustration } from "./services/geminiService";
import {
  getUserPreferences,
  updateUserPreferences,
  checkAndDecrementCredits,
} from "./services/firestoreService";
import Spinner from "./components/Spinner";
import { splitSentences } from "./utils/textUtils";
import ErrorBoundary from "./components/ErrorBoundary";
import ShareStoryScreen from "./components/ShareStoryScreen";
import TermsOfService from "./components/TermsOfService";
import PrivacyPolicy from "./components/PrivacyPolicy";
import SubscriptionModal from "./components/SubscriptionModal";
import Footer from "./components/Footer"; // Import new footer

type Screen = "home" | "story" | "share";

const STORY_CREDIT_COST = [
  1, // Short
  2, // Medium
  3, // Long
  4, // Epic
];

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <>
      {children}
      <Footer />
    </>
  );
};

const AppContent: React.FC = () => {
  const { user, loading: authLoading } = useAuth();

  const [screen, setScreen] = useState<Screen>("home");
  const [story, setStory] = useState<Story | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isInitiallySaved, setIsInitiallySaved] = useState(false);

  // Set a default voice state, which will be updated from Firestore   or localStorage
  const [voice, setVoice] = useState<string>("Leda");
  const [speakingRate, setSpeakingRate] = useState<number>(1.0);
  const [storyLength, setStoryLength] = useState<number>(0);

  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [subscriptionModalReason, setSubscriptionModalReason] = useState<"limit" | "manual">("limit");
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (window.location.pathname.startsWith('/story/')) {
      setScreen("share");
    }
  }, []);

  // Sync local settings state when user object loads/changes
  useEffect(() => {
    if (user) {
      getUserPreferences(user.uid).then(prefs => {
        if (prefs.voice) setVoice(prefs.voice);
        if (prefs.speakingRate) setSpeakingRate(prefs.speakingRate);
        if (prefs.storyLength !== undefined) setStoryLength(prefs.storyLength);
      });
    } else {
      // Load from localStorage if logged out
      setVoice(localStorage.getItem("selectedVoice") || "Leda");
      setSpeakingRate(parseFloat(localStorage.getItem("speakingRate") || "1.0"));
      setStoryLength(parseInt(localStorage.getItem("storyLength") || "0"));
    }
  }, [user]);

  const handleGoHome = useCallback(() => {
    if (screen === 'share') {
      window.location.href = '/';
    } else {
      setStory(null);
      setScreen("home");
      setError(null);
    }
  }, [screen]);

  // Settings change handlers now update Firestore if logged in
  const handleVoiceChange = useCallback((newVoice: string) => {
    setVoice(newVoice);
    localStorage.setItem("selectedVoice", newVoice);
    if (user) {
      updateUserPreferences(user.uid, { voice: newVoice });
    }
  }, [user]);

  const handleSpeakingRateChange = useCallback((newRate: number) => {
    setSpeakingRate(newRate);
    localStorage.setItem("speakingRate", newRate.toString());
    if (user) {
      updateUserPreferences(user.uid, { speakingRate: newRate });
    }
  }, [user]);

  const handleStoryLengthChange = useCallback((newLength: number) => {
    setStoryLength(newLength);
    localStorage.setItem("storyLength", newLength.toString());
    if (user) {
      updateUserPreferences(user.uid, { storyLength: newLength });
    }
  }, [user]);

  const handleCreateStory = useCallback(async (topic: string, length: number) => {
    if (!user) {
      setError("Please log in to create stories.");
      return;
    }

    if (Tone.context.state !== "running") {
      await Tone.start();
    }

    // --- CREDIT CHECK LOGIC ---
    const creditsToDeduct = STORY_CREDIT_COST[length];
    const hasEnoughCredits = await checkAndDecrementCredits(user.uid, creditsToDeduct, user.email);
    
    if (!hasEnoughCredits) {
      setSubscriptionModalReason("limit");
      setShowSubscriptionModal(true);
      return; // Stop execution
    }
    // --- END CREDIT CHECK ---

    setIsLoading(true);
    setLoadingMessage("Thinking of a wonderful story...");
    setError(null);
    try {
      const { title, text, illustration, quiz } =
        await generateStoryAndIllustration(topic, length);

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
      setIsInitiallySaved(false);
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
  }, [user]);

  const handleLoadStory = useCallback(async (storyToLoad: Story) => {
    if (Tone.context.state !== "running") {
      await Tone.start();
    }
    setStory(storyToLoad);
    setIsInitiallySaved(true);
    setScreen("story");
  }, []);

  const handleUpgrade = async (priceId: string) => {
    if (!user) return;
    setIsUpgrading(true);
    try {
      const session = await createCheckoutSession(payments, {
        price: priceId,
        success_url: `${window.location.origin}?checkout_success=true`,
        cancel_url: window.location.origin,
      });
      window.location.assign(session.url);
    } catch (error) {
      console.error("Stripe Checkout Error:", error);
      setError("Could not connect to payment gateway. Please try again.");
      setIsUpgrading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!user) return;
    setIsCancelling(true);
    
    try {
      const createPortalLink = httpsCallable(functions, 'ext-firestore-stripe-payments-createPortalLink');
      const { data } = await createPortalLink({ returnUrl: window.location.origin });
      window.location.assign((data as any).url);
    } catch (error) {
      console.error("Error creating portal link:", error);
      setError("Could not manage subscription. Please try again later.");
      setIsCancelling(false);
    }
  };

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("checkout_success")) {
      alert("Welcome! Your subscription is now active.");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  let pageContent;
  if (screen === 'share') {
    pageContent = <ErrorBoundary><ShareStoryScreen user={user} /></ErrorBoundary>;
  } else if (screen === 'home') {
    pageContent = (
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
          storyLength={storyLength}
          onStoryLengthChange={handleStoryLengthChange}
          setError={setError}
          // --- PASS NEW PROPS ---
          onUpgradeClick={() => {
            setSubscriptionModalReason("manual");
            setShowSubscriptionModal(true);
          }}
          onCancelSubscription={handleCancelSubscription}
          isCancelling={isCancelling}
          // --- END NEW PROPS ---
        />
      </ErrorBoundary>
    );
  } else if (story) {
    pageContent = (
      <ErrorBoundary>
        <StoryScreen
          user={user}
          story={story}
          onGoHome={handleGoHome}
          voice={voice}
          speakingRate={speakingRate}
          isInitiallySaved={isInitiallySaved}
          setError={setError}
        />
      </ErrorBoundary>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-4 bg-sky-50 text-slate-800">
      {(screen === "story" || screen === "share") && <Header onGoHome={handleGoHome} user={user} />}
      <main className="w-full max-w-4xl mx-auto flex-grow flex items-center justify-center">
        {authLoading ? <Spinner message="Loading your profile..." /> : pageContent}
      </main>

      {/* --- ADDED MODAL --- */}
      {showSubscriptionModal && (
        <SubscriptionModal
          onClose={() => setShowSubscriptionModal(false)}
          onSubscribe={handleUpgrade}
          reason={subscriptionModalReason}
          isUpgrading={isUpgrading}
        />
      )}
    </div>
  );
};

// Main App component is now the Router
const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/terms-of-service" element={<TermsOfService />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route
          path="/*"
          element={
            <Layout>
              <AppContent />
            </Layout>
          }
        />
      </Routes>
    </Router>
  );
};

export default App;