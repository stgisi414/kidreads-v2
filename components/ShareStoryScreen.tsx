import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { Story } from '../types';
import Spinner from './Spinner';
import Icon from './Icon';
import type { User } from 'firebase/auth';
import { saveStory } from '../services/firestoreService';
import { loginWithGoogle } from '../services/authService';

type ShareStoryScreenProps = {
  user: User | null;
};

const ShareStoryScreen: React.FC<ShareStoryScreenProps> = ({ user }) => {
  const [story, setStory] = useState<Story | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    const fetchStory = async () => {
      setIsLoading(true);
      setError(null);
      setShowLogin(false);
      try {
        const path = window.location.pathname;
        const parts = path.split('/').filter(p => p);
        if (parts.length < 3 || parts[0] !== 'story') {
          throw new Error('Invalid story link.');
        }
        const [, userId, storyId] = parts;

        const storyDocRef = doc(db, 'users', userId, 'stories', storyId);
        const docSnap = await getDoc(storyDocRef);

        if (docSnap.exists()) {
          setStory(docSnap.data() as Story);
        } else {
          throw new Error("Sorry, we couldn't find that story.");
        }
      } catch (err: any) {
        if (err.code === 'permission-denied') {
          setError("Please log in to view this story.");
          setShowLogin(true);
        } else {
          setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchStory();
  }, [user]);

  const handleSaveStory = async () => {
    if (!user || !story || isSaved || isSaving) return;
    setIsSaving(true);
    try {
        await saveStory(user.uid, story);
        setIsSaved(true);
    } catch (err) {
        console.error("Error saving story:", err);
        setError("Could not save the story. Please try again.");
    } finally {
        setIsSaving(false);
    }
  };

  if (isLoading) {
    return <Spinner message="Loading story..." />;
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      {error && (
        <div className="text-center text-red-500 font-bold mb-4">
          {error}
          {showLogin && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={loginWithGoogle}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-full font-bold text-lg hover:bg-blue-600 transition-transform hover:scale-105 shadow-lg"
              >
                <Icon name="login" className="w-6 h-6"/>
                <span>Login with Google</span>
              </button>
            </div>
          )}
        </div>
      )}
      {story && (
        <div className="bg-white p-6 rounded-3xl shadow-xl">
          <h2 className="text-4xl font-black text-center text-blue-600 mb-4">{story.title}</h2>
          <img src={story.illustration} alt={story.title} className="w-full h-auto max-h-96 object-contain rounded-2xl mb-6" />
          <div className="text-2xl leading-relaxed text-slate-700 space-y-4">
            {story.sentences.map((sentence, index) => (
              <p key={index}>{sentence}</p>
            ))}
          </div>
          {user && (
            <div className="mt-6 text-center">
              <button
                onClick={handleSaveStory}
                disabled={isSaving || isSaved}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-green-500 text-white rounded-full font-bold text-lg hover:bg-green-600 transition-transform hover:scale-105 shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                <Icon name={isSaved ? 'check' : 'bookmark'} className="w-6 h-6"/>
                <span>{isSaved ? 'Saved!' : (isSaving ? 'Saving...' : 'Save to My Stories')}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ShareStoryScreen;