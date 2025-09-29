import React, { useState, useEffect } from 'react';
import type { Story } from '../types';
import Icon from './Icon';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import QuizResultsModal from './QuizResultsModal';
import Spinner from './Spinner';
import type { User } from 'firebase/auth';

type SavedStoriesModalProps = {
  savedStories: Story[];
  onLoadStory: (story: Story) => void;
  onDeleteStory: (storyId: number) => void;
  onClose: () => void;
  voice: string;
  speakingRate: number;
  user: User | null;
};

const SavedStoriesModal: React.FC<SavedStoriesModalProps> = ({ user, savedStories, onLoadStory, onDeleteStory, onClose, voice, speakingRate }) => {
  const { speak, isSpeaking } = useTextToSpeech();
  const [selectedStoryForResults, setSelectedStoryForResults] = useState<Story | null>(null);
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [copiedLink, setCopiedLink] = useState<number | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  const allImagesLoaded = imagesLoaded === savedStories.length;

  useEffect(() => {
    setImagesLoaded(0);
  }, [savedStories]);

  const handleImageLoad = () => {
    setImagesLoaded(prev => prev + 1);
  };

  const handleShareStory = (storyId: number) => {
    if (!user) return;
    const shareLink = `${window.location.origin}/story/${user.uid}/${storyId}`;
    
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopiedLink(storyId);
      speak("Story link copied.", undefined, voice, false, true, 1.0);
      setTimeout(() => setCopiedLink(null), 2000);
    }).catch(err => {
      console.error('Failed to copy link: ', err);
      setShareError('Could not copy link. Please try again.');
      setTimeout(() => setShareError(null), 3000);
    });
  };

  return (
    <>
      {selectedStoryForResults && (
        <QuizResultsModal story={selectedStoryForResults} onClose={() => setSelectedStoryForResults(null)} />
      )}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-2xl w-full relative animate-fade-in-up flex flex-col">
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 z-10">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <h2 className="text-4xl font-black text-blue-600 mb-6 text-center">My Saved Stories</h2>
          
          {shareError && <p className="text-center text-red-500 font-semibold mb-4">{shareError}</p>}
          
          <div className="overflow-y-auto max-h-96">
            {!allImagesLoaded && <Spinner message="Loading saved stories..." />}
            {savedStories.length > 0 ? (
              <ul className={`space-y-4 ${!allImagesLoaded ? 'hidden' : ''}`}>
                {savedStories.map(story => (
                <li key={story.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-slate-100 rounded-lg">
                  <div className="flex items-center w-full mb-2 md:mb-0">
                    <img 
                      src={story.illustration} 
                      alt={story.title} 
                      className="w-16 h-16 rounded-md object-cover mr-4"
                      onLoad={handleImageLoad}
                      onError={handleImageLoad}
                    />
                    <span
                        className={`font-bold text-lg text-slate-700 flex-grow ${isSpeaking ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        onClick={() => !isSpeaking && allImagesLoaded && speak(story.title, undefined, voice, false, true, speakingRate)}
                    >
                      {story.title}
                    </span>
                  </div>
                  <div className="flex gap-2 justify-end w-full md:w-auto relative">
                      <div className="relative">
                          <button 
                              onClick={() => handleShareStory(story.id)} 
                              disabled={isSpeaking || !allImagesLoaded} 
                              className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition disabled:bg-gray-400"
                              title="Share Story"
                          >
                              {copiedLink === story.id ? <Icon name="check" className="w-6 h-6"/> : <Icon name="share" className="w-6 h-6"/>}
                          </button>
                          {copiedLink === story.id && (
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-800 text-white text-sm font-semibold py-1 px-3 rounded-md shadow-lg z-20 whitespace-nowrap">
                                  Link Copied!
                              </div>
                          )}
                      </div>
                      <button onClick={() => !isSpeaking && setSelectedStoryForResults(story)} disabled={isSpeaking || !allImagesLoaded} className="p-2 bg-purple-500 text-white rounded-full hover:bg-purple-600 transition disabled:bg-gray-400" title="View Quiz Results"><Icon name="results" className="w-6 h-6"/></button>
                      <button onClick={() => !isSpeaking && onLoadStory(story)} disabled={isSpeaking || !allImagesLoaded} className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 transition disabled:bg-gray-400" title="Read Story"><Icon name="play" className="w-6 h-6"/></button>
                      <button onClick={() => onDeleteStory(story.id)} disabled={!allImagesLoaded} className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition disabled:bg-gray-400" title="Delete Story"><Icon name="trash" className="w-6 h-6"/></button>
                  </div>
                </li>
              ))}
              </ul>
            ) : (
              <p className="text-center text-slate-500 text-lg">You haven't saved any stories yet.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SavedStoriesModal;