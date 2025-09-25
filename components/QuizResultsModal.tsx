// stgisi414/kidreads-v2/kidreads-v2-5096bbab39cec5b36bff0af2170f45b4a523b759/components/QuizResultsModal.tsx
import React from 'react';
import type { Story } from '../types';
import Icon from './Icon';

type QuizResultsModalProps = {
  story: Story;
  onClose: () => void;
};

const QuizResultsModal: React.FC<QuizResultsModalProps> = ({ story, onClose }) => {
  const { quizResults } = story;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-2xl w-full relative animate-fade-in-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <h2 className="text-4xl font-black text-blue-600 mb-4 text-center">Quiz Results</h2>
        
        <div className="flex items-center gap-4 mb-6">
          <img src={story.illustration} alt={story.title} className="w-24 h-24 rounded-lg object-cover" />
          <h3 className="text-2xl font-bold text-slate-800">{story.title}</h3>
        </div>

        {quizResults ? (
          <div>
            <div className="text-center mb-6">
              <p className="text-xl text-slate-600">Taken on: <span className="font-bold">{new Date(quizResults.date).toLocaleDateString()}</span></p>
              <p className="text-2xl text-slate-800">Final Score: <span className="font-bold text-green-500">{quizResults.score} / {story.quiz.length}</span></p>
            </div>
            <div className="space-y-4 max-h-60 overflow-y-auto">
              {quizResults.answers.map((result, index) => (
                <div key={index} className={`p-4 rounded-lg ${result.selected === result.correct ? 'bg-green-100' : 'bg-red-100'}`}>
                  <p className="font-bold text-lg text-slate-800">{result.question}</p>
                  <p className="text-md text-slate-600">You answered: <span className={result.selected === result.correct ? 'text-green-700' : 'text-red-700'}>{result.selected}</span></p>
                  {result.selected !== result.correct && (
                    <p className="text-md text-slate-600">Correct answer: <span className="text-green-700">{result.correct}</span></p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-center text-slate-500 text-lg mt-8">This quiz has not been taken yet.</p>
        )}
      </div>
    </div>
  );
};

export default QuizResultsModal;