import React, { useState, useEffect } from 'react';
import type { QuizQuestion } from '../types';
import Icon from './Icon';
import { useTextToSpeech } from '../hooks/useTextToSpeech';

type QuizModalProps = {
  questions: QuizQuestion[];
  onClose: () => void;
};

const QuizModal: React.FC<QuizModalProps> = ({ questions, onClose }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [showResults, setShowResults] = useState(false);

  const { speak, cancel, isSpeaking } = useTextToSpeech();

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  const handleAnswerSubmit = () => {
    cancel();
    const correct = selectedAnswer === questions[currentQuestionIndex].answer;
    setIsCorrect(correct);
    if (correct) {
      setScore(s => s + 1);
      speak("That's right!");
    } else {
      speak("Not quite, let's try the next one.");
    }

    setTimeout(() => {
      setIsCorrect(null);
      setSelectedAnswer(null);
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(i => i + 1);
      } else {
        setShowResults(true);
      }
    }, 2000);
  };

  const handleRestart = () => {
    cancel();
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setScore(0);
    setShowResults(false);
  };

   const handleSelectAnswer = (option: string) => {
    if (isCorrect !== null) return;
    setSelectedAnswer(option);
    cancel(); // Stop any other speech
    speak(option);
  };

  const handleReadQuestion = () => {
    cancel();
    speak(currentQuestion.question);
  };

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-2xl w-full relative animate-fade-in-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        {showResults ? (
          <div className="text-center">
            <h2 className="text-4xl font-black text-blue-600 mb-4">Quiz Complete!</h2>
            <p className="text-2xl text-slate-700 mb-6">Your score: <span className="font-bold text-green-500">{score}</span> / {questions.length}</p>
            <div className="flex justify-center gap-4">
              <button onClick={handleRestart} className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-full font-bold text-lg hover:bg-blue-600 transition-transform hover:scale-105 shadow-lg"><Icon name="retry" className="w-6 h-6"/>Restart Quiz</button>
              <button onClick={onClose} className="px-6 py-3 bg-slate-200 text-slate-700 rounded-full font-bold text-lg hover:bg-slate-300 transition">Close</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-center gap-4 mb-6">
              <h3 className="text-2xl font-bold text-slate-800 text-center">{currentQuestion.question}</h3>
              <button onClick={handleReadQuestion} disabled={isSpeaking} className="text-blue-500 hover:text-blue-700 disabled:text-gray-400">
                <Icon name="microphone" className="w-8 h-8"/>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {currentQuestion.options.map(option => {
                const isSelected = selectedAnswer === option;
                const isTheCorrectAnswer = isCorrect !== null && option === currentQuestion.answer;
                const isTheIncorrectAnswer = isCorrect === false && isSelected;

                return (
                  <button
                    key={option}
                    onClick={() => handleSelectAnswer(option)}
                    disabled={isCorrect !== null}
                    className={`p-4 rounded-xl text-lg font-semibold text-left transition-all duration-300 border-4
                      ${isTheCorrectAnswer ? 'bg-green-100 border-green-400 text-green-800' : ''}
                      ${isTheIncorrectAnswer ? 'bg-red-100 border-red-400 text-red-800' : ''}
                      ${!isSelected && isCorrect === null ? 'bg-slate-100 border-slate-200 hover:bg-blue-100 hover:border-blue-300' : ''}
                      ${isSelected && isCorrect === null ? 'bg-blue-200 border-blue-400' : ''}
                      ${isCorrect !== null ? 'cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleAnswerSubmit}
              disabled={!selectedAnswer || isCorrect !== null}
              className="w-full px-6 py-4 bg-blue-500 text-white rounded-full font-bold text-xl hover:bg-blue-600 transition-transform hover:scale-105 shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none"
            >
              Submit
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuizModal;