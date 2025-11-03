import React, { useState, useEffect, useRef } from 'react';
import type { Story } from '../types';
import Icon from './Icon';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import QuizResultsModal from './QuizResultsModal';
import Spinner from './Spinner';
import type { User } from 'firebase/auth';
import BookReportModal from './BookReportModal';

type SavedStoriesModalProps = {
  savedStories: Story[];
  onLoadStory: (story: Story) => void;
  onDeleteStory: (storyId: number) => void;
  onClose: () => void;
  voice: string;
  speakingRate: number;
  user: User | null;
  onUpdateStory: (story: Story) => void;
};

// --- UPDATED: Key definitions ---
const iconKeyItems = [
  { name: 'share', label: 'Share', description: 'Copy a shareable link for this story.', color: 'bg-blue-500' },
  { name: 'report', label: 'Report', description: 'Create a book report for this story.', color: 'bg-orange-500' },
  { name: 'results', label: 'Results', description: 'See your previous quiz scores.', color: 'bg-purple-500' },
  { name: 'play', label: 'Read', description: 'Open and read this story.', color: 'bg-green-500' },
  { name: 'print', label: 'Print', description: 'Print this story and its reports.', color: 'bg-gray-500' }, // <-- ADDED
  { name: 'trash', label: 'Delete', description: 'Permanently delete this story.', color: 'bg-red-500' },
];
// --- END UPDATED ---

const SavedStoriesModal: React.FC<SavedStoriesModalProps> = ({ user, savedStories, onLoadStory, onDeleteStory, onClose, voice, speakingRate, onUpdateStory }) => {
  const { speak, isSpeaking } = useTextToSpeech();
  const [selectedStoryForResults, setSelectedStoryForResults] = useState<Story | null>(null);
  const [storyForReport, setStoryForReport] = useState<Story | null>(null);
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [copiedLink, setCopiedLink] = useState<{ id: number; top: number; left: number } | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const shareButtonRefs = useRef<{ [key: number]: HTMLButtonElement | null }>({});

  const allImagesLoaded = imagesLoaded === savedStories.length;

  useEffect(() => {
    setImagesLoaded(0);
  }, [savedStories]);

  const handleImageLoad = () => {
    setImagesLoaded(prev => prev + 1);
  };

  const handleShareStory = (storyId: number) => {
    // ... (this function is unchanged)
  };

  const handleKeyClick = (description: string) => {
    if (isSpeaking) return;
    speak(description, undefined, voice, false, true, speakingRate);
  };

  const handleReportSaved = (updatedStory: Story) => {
    onUpdateStory(updatedStory);
    setStoryForReport(updatedStory);
  };

  // --- ADDED: Print Handler ---
  const handlePrintStory = (story: Story) => {
    if (!story) return;

    // 1. Create the HTML content
    const storyHtml = story.sentences.map((p, index) => 
      `<p class="story-text ${index === 0 ? 'first-paragraph' : ''}">${p}</p>`
    ).join('');

    let quizHtml = '';
    if (story.quizResults) {
      quizHtml = `
        <div class="quiz-section">
          <h3>Quiz Results</h3>
          <p class="quiz-score">Score: <strong>${story.quizResults.score} / ${story.quiz.length}</strong></p>
          <ul class="quiz-list">
            ${story.quizResults.answers.map(ans => `
              <li>
                <p class="quiz-question">${ans.question}</p>
                ${ans.selected === ans.correct
                  ? `<p class="quiz-answer correct">You answered: ${ans.selected}</p>`
                  : `<p class="quiz-answer incorrect">You answered: ${ans.selected}</p>
                     <p class="quiz-answer correct">Correct answer: ${ans.correct}</p>`
                }
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    let reportHtml = '';
    if (story.bookReport) {
      reportHtml = `
        <div class="report-section">
          <h3>Book Report</h3>
          <p class="book-report">${story.bookReport.text.replace(/\n/g, '<br>')}</p>
          <p class="report-source">(${story.bookReport.source})</p>
        </div>
      `;
    }

    // This is the HTML that will be injected
    const printHtmlBody = `
      <h2>${story.title}</h2>
      <div class="story-content">
        <img src="${story.illustration}" alt="${story.title}" class="story-image">
        ${storyHtml}
      </div>
      <div style="clear: both;"></div>
      ${quizHtml}
      ${reportHtml}
    `;
    
    // These are the styles that will be applied *only* for printing
    const printStyles = `
      @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;900&display=swap');
      
      /* Hide everything on the page by default */
      body > * {
        display: none !important;
        visibility: hidden !important;
      }

      /* Show only our print container and its contents */
      #print-container, #print-container * {
        display: block !important;
        visibility: visible !important;
      }

      /* Position our print container at the top */
      #print-container {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        font-family: 'Nunito', sans-serif;
        color: #333;
        margin: 25px;
      }
      
      h2 {
        font-size: 28px;
        font-weight: 900;
        color: #2563eb;
        text-align: center;
        margin-bottom: 20px;
        page-break-after: avoid;
      }
      .story-content {
        margin-top: 20px;
        page-break-inside: avoid;
      }
      .story-image {
        float: left;
        width: 45%;
        margin-right: 20px;
        margin-bottom: 10px;
        border-radius: 8px;
        page-break-inside: avoid;
      }
      .story-text {
        font-size: 16px;
        line-height: 1.6;
        margin-top: 0;
      }
      .first-paragraph::first-letter {
        font-family: 'Georgia', serif;
        font-size: 4.5em;
        font-weight: bold;
        float: left;
        line-height: 0.8;
        margin-right: 8px;
        margin-top: 6px;
      }
      h3 {
        font-size: 22px;
        font-weight: 700;
        color: #1e40af;
        border-bottom: 2px solid #ddd;
        padding-bottom: 5px;
        margin-top: 25px;
        page-break-after: avoid;
      }
      .quiz-section, .report-section {
        page-break-before: auto;
        margin-top: 25px;
      }
      .quiz-list {
        list-style-type: decimal;
        padding-left: 20px;
      }
      .quiz-list li {
        margin-bottom: 15px;
        page-break-inside: avoid;
      }
      .quiz-question {
        font-weight: 700;
        margin-bottom: 5px;
      }
      .quiz-answer {
        margin: 2px 0 2px 10px;
      }
      .correct { color: #166534; }
      .incorrect { color: #991b1b; }
      .book-report {
        font-size: 16px;
        line-height: 1.6;
        white-space: pre-wrap;
        font-style: italic;
        background-color: #f9f9f9;
        border-left: 4px solid #ddd;
        padding: 10px 15px;
      }
      .report-source {
        font-size: 12px;
        color: #555;
        text-align: right;
        font-style: italic;
      }
    `;

    // 2. Create and append the new elements
    const styleSheet = document.createElement('style');
    styleSheet.type = 'text/css';
    styleSheet.id = 'print-stylesheet';
    styleSheet.innerHTML = `@media print { ${printStyles} }`; // Only apply for print
    document.head.appendChild(styleSheet);

    const printContainer = document.createElement('div');
    printContainer.id = 'print-container';
    printContainer.innerHTML = printHtmlBody;
    document.body.appendChild(printContainer);

    // 3. Wait for images to load (if any)
    const images = printContainer.getElementsByTagName('img');
    let loadedImages = 0;
    const totalImages = images.length;

    const cleanup = () => {
      // Use setTimeout to ensure cleanup happens after print dialog closes
      setTimeout(() => {
        document.head.removeChild(styleSheet);
        document.body.removeChild(printContainer);
      }, 500);
    };

    const triggerPrint = () => {
      window.print();
      cleanup();
    };

    if (totalImages === 0) {
      triggerPrint();
    } else {
      const onImageLoad = () => {
        loadedImages++;
        if (loadedImages === totalImages) {
          triggerPrint();
        }
      };
      
      Array.from(images).forEach(img => {
        if (img.complete) {
          onImageLoad();
        } else {
          img.onload = onImageLoad;
          img.onerror = onImageLoad; // Count errors as "loaded"
        }
      });
    }
  };
  // --- END ADDED ---

  return (
    <>
      {selectedStoryForResults && (
        <QuizResultsModal story={selectedStoryForResults} onClose={() => setSelectedStoryForResults(null)} />
      )}
      {storyForReport && user && (
        <BookReportModal
          story={storyForReport}
          onClose={() => setStoryForReport(null)}
          onSave={handleReportSaved}
          user={user}
          voice={voice}
          speakingRate={speakingRate}
        />
      )}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-40">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-2xl w-full animate-fade-in-up flex flex-col max-h-[90vh] relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 z-10">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <h2 className="text-4xl font-black text-blue-600 mb-6 text-center">My Saved Stories</h2>
          
          {shareError && <p className="text-center text-red-500 font-semibold mb-4">{shareError}</p>}
          
          <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-2">
              {iconKeyItems.map(item => (
                <button
                  key={item.name}
                  onClick={() => handleKeyClick(item.description)}
                  disabled={isSpeaking}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white border border-slate-300 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
                  title={item.label}
                >
                  <div className={`p-1 rounded-full ${item.color}`}>
                    <Icon name={item.name as any} className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div className="overflow-y-auto flex-grow">
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
                  {/* --- UPDATED: Button sizes and new print button --- */}
                  <div className="flex gap-2 justify-end w-full md:w-auto">
                      <button
                        ref={el => (shareButtonRefs.current[story.id] = el)}
                        onClick={() => handleShareStory(story.id)}
                        disabled={isSpeaking || !allImagesLoaded}
                        className="p-1.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition disabled:bg-gray-400"
                        title="Share Story"
                      >
                        {copiedLink?.id === story.id ? <Icon name="check" className="w-5 h-5"/> : <Icon name="share" className="w-5 h-5"/>}
                      </button>
                      <button 
                        onClick={() => !isSpeaking && setStoryForReport(story)} 
                        disabled={isSpeaking || !allImagesLoaded} 
                        className="p-1.5 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition disabled:bg-gray-400" 
                        title="Book Report">
                        <Icon name="report" className="w-5 h-5"/>
                      </button>
                      <button onClick={() => !isSpeaking && setSelectedStoryForResults(story)} disabled={isSpeaking || !allImagesLoaded} className="p-1.5 bg-purple-500 text-white rounded-full hover:bg-purple-600 transition disabled:bg-gray-400" title="View Quiz Results"><Icon name="results" className="w-5 h-5"/></button>
                      <button onClick={() => !isSpeaking && onLoadStory(story)} disabled={isSpeaking || !allImagesLoaded} className="p-1.5 bg-green-500 text-white rounded-full hover:bg-green-600 transition disabled:bg-gray-400" title="Read Story"><Icon name="play" className="w-5 h-5"/></button>
                      <button 
                        onClick={() => handlePrintStory(story)} 
                        disabled={isSpeaking || !allImagesLoaded} 
                        className="p-1.5 bg-gray-500 text-white rounded-full hover:bg-gray-600 transition disabled:bg-gray-400" 
                        title="Print">
                        <Icon name="print" className="w-5 h-5"/>
                      </button>
                      <button onClick={() => onDeleteStory(story.id)} disabled={!allImagesLoaded} className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition disabled:bg-gray-400" title="Delete Story"><Icon name="trash" className="w-5 h-5"/></button>
                  </div>
                  {/* --- END UPDATES --- */}
                </li>
              ))}
              </ul>
            ) : (
              <p className="text-center text-slate-500 text-lg">You haven't saved any stories yet.</p>
            )}
          </div>
        </div>
      </div>
      {copiedLink && (
        <div
          className="fixed bg-slate-800 text-white text-sm font-semibold py-1 px-3 rounded-md shadow-lg z-[9999999] whitespace-nowrap"
          style={{ top: copiedLink.top + 15, left: copiedLink.left, transform: 'translateX(-50%)' }}
        >
          Link Copied!
        </div>
      )}
    </>
  );
};

export default SavedStoriesModal;