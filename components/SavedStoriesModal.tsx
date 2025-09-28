// stgisi414/kidreads-v2/kidreads-v2-5096bbab39cec5b36bff0af2170f45b4a523b759/components/SavedStoriesModal.tsx
import React, { useState } from 'react';
import type { Story } from '../types';
import Icon from './Icon';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import QuizResultsModal from './QuizResultsModal';

type SavedStoriesModalProps = {
  savedStories: Story[];
  onLoadStory: (story: Story) => void;
  onDeleteStory: (storyId: number) => void;
  onClose: () => void;
  voice: string;
};

const SavedStoriesModal: React.FC<SavedStoriesModalProps> = ({ savedStories, onLoadStory, onDeleteStory, onClose, voice }) => {
  const { speak, isSpeaking } = useTextToSpeech();
  const [selectedStoryForResults, setSelectedStoryForResults] = useState<Story | null>(null);

  return (
    <>
      {selectedStoryForResults && (
        <QuizResultsModal story={selectedStoryForResults} onClose={() => setSelectedStoryForResults(null)} />
      )}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-2xl w-full relative animate-fade-in-up">
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <h2 className="text-4xl font-black text-blue-600 mb-6 text-center">My Saved Stories</h2>
          
          {savedStories.length > 0 ? (
            <ul className="space-y-4 max-h-96 overflow-y-auto">
              {savedStories.map(story => (
              <li key={story.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-slate-100 rounded-lg">
                <div className="flex items-center w-full mb-2 md:mb-0">
                  <img src={story.illustration} alt={story.title} className="w-16 h-16 rounded-md object-cover mr-4" />
                  <span
                      className={`font-bold text-lg text-slate-700 flex-grow ${isSpeaking ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      onClick={() => !isSpeaking && speak(story.title, undefined, voice, false)}
                  >
                    {story.title}
                  </span>
                </div>
                <div className="flex gap-2 justify-end w-full md:w-auto">
                  <button onClick={() => !isSpeaking && setSelectedStoryForResults(story)} disabled={isSpeaking} className="p-2 bg-purple-500 text-white rounded-full hover:bg-purple-600 transition disabled:bg-gray-400"><Icon name="results" className="w-6 h-6"/></button>
                  <button onClick={() => !isSpeaking && onLoadStory(story)} disabled={isSpeaking} className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 transition disabled:bg-gray-400"><Icon name="play" className="w-6 h-6"/></button>
                  <button onClick={() => onDeleteStory(story.id)} className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition"><Icon name="trash" className="w-6 h-6"/></button>
                </div>
              </li>
            ))}
            </ul>
          ) : (
            <p className="text-center text-slate-500 text-lg">You haven't saved any stories yet.</p>
          )}
        </div>
      </div>
    </>
  );
};

export default SavedStoriesModal;