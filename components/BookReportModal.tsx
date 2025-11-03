import React, { useState, useEffect, useCallback } from 'react';
import type { Story, BookReport } from '../types';
import type { User } from 'firebase/auth';
import Icon from './Icon';
import Spinner from './Spinner';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import { transcribeAudio, generateBookReport, editBookReport } from '../services/geminiService';
import { updateStory } from '../services/firestoreService';
import * as Tone from 'tone';

type BookReportModalProps = {
  story: Story;
  onClose: () => void;
  onSave: (updatedStory: Story) => void;
  user: User | null;
  voice: string;
  speakingRate: number;
};

type ReportStatus = 'idle' | 'recording' | 'transcribing' | 'generating' | 'editing' | 'saving' | 'error';

// --- ADDED: Key definitions ---
const reportKeyItems = [
  { name: 'microphone', label: 'Speak', description: 'Speak your own book report.', color: 'bg-blue-500' },
  { name: 'idea', label: 'Generate', description: 'Let the AI write a book report for you.', color: 'bg-purple-500' },
  { name: 'star', label: 'Edit', description: 'Ask the AI to edit your spoken report.', color: 'bg-yellow-500' },
  { name: 'share', label: 'Copy', description: 'Copy the report text.', color: 'bg-slate-500' },
  { name: 'save', label: 'Save', description: 'Save this report to the story.', color: 'bg-green-500' },
];
// --- END ADDED ---

const BookReportModal: React.FC<BookReportModalProps> = ({ 
  story, 
  onClose, 
  onSave, 
  user, 
  voice, 
  speakingRate 
}) => {
  const [report, setReport] = useState<BookReport | null>(story.bookReport || null);
  const [status, setStatus] = useState<ReportStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  
  const { recorderState, startRecording, stopRecording, permissionError } = useAudioRecorder();
  const { speak, isSpeaking } = useTextToSpeech();

  const isLoading = status === 'transcribing' || status === 'generating' || status === 'editing' || status === 'saving';
  const isRecording = status === 'recording';

  // --- ADDED: Handler for key click ---
  const handleKeyClick = (description: string) => {
    if (isSpeaking) return;
    speak(description, undefined, voice, false, true, speakingRate);
  };
  // --- END ADDED ---

  // --- ADDED: Handler for reading report ---
  const handleReadReport = () => {
    if (isSpeaking || !report || !report.text) return;
    speak(report.text, undefined, voice, false, true, speakingRate);
  };
  // --- END ADDED ---

  const handleMicClick = async () => {
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }
    setError(null);

    if (isRecording) {
      setStatus('transcribing');
      try {
        const audioBase64 = await stopRecording();
        if (audioBase64) {
          const { transcription } = await transcribeAudio(audioBase64);
          if (transcription && transcription.trim()) {
            setReport({ text: transcription, source: 'transcribed' });
            setStatus('idle');
          } else {
            setError("I couldn't quite catch that. Please try again.");
            setStatus('error');
          }
        } else {
          setError("No audio was recorded. Please try again.");
          setStatus('error');
        }
      } catch (e: any) {
        console.error("Transcription failed", e);
        setError("Sorry, I couldn't understand that. Please try again.");
        setStatus('error');
      }
    } else {
      await startRecording();
      setStatus('recording');
    }
  };

  const handleGenerateReport = async () => {
    if (isLoading) return;
    setError(null);
    setStatus('generating');
    try {
      const { report: generatedText } = await generateBookReport(story.text);
      setReport({ text: generatedText, source: 'generated' });
      setStatus('idle');
    } catch (e: any) {
      console.error("Report generation failed", e);
      setError("Sorry, I couldn't generate the report. Please try again.");
      setStatus('error');
    }
  };
  
  const handleEditReport = async () => {
    if (isLoading || !report || report.source !== 'transcribed') return;
    setError(null);
    setStatus('editing');
    try {
      const { editedReport } = await editBookReport(story.text, report.text);
      setReport({ text: editedReport, source: 'edited' });
      setStatus('idle');
    } catch (e: any) {
      console.error("Report editing failed", e);
      setError("Sorry, I couldn't edit the report. Please try again.");
      setStatus('error');
    }
  };

  const handleSaveReport = async () => {
    if (isLoading || !report || !user) return;
    setError(null);
    setStatus('saving');
    try {
      const updatedStory: Story = { ...story, bookReport: report };
      await updateStory(user.uid, updatedStory);
      
      onSave(updatedStory); 
      
      setStatus('idle');
      speak("Report saved!", undefined, voice, false, true, 1.0);
    } catch (e: any) {
      console.error("Report saving failed", e);
      setError("Sorry, I couldn't save the report. Please try again.");
      setStatus('error');
    }
  };

  const handleCopyReport = () => {
    if (!report) return;
    navigator.clipboard.writeText(report.text);
    speak("Report copied to clipboard.", undefined, voice, false, true, 1.0);
  };
  
  const getStatusMessage = () => {
    switch(status) {
      case 'recording': return "Listening... Press the button to stop.";
      case 'transcribing': return "Thinking about what you said...";
      case 'generating': return "Writing a report for you...";
      case 'editing': return "Editing your report...";
      case 'saving': return "Saving your report...";
      case 'error': return error;
      default: return permissionError ? "Please allow microphone access." : "Speak, generate, or edit your report.";
    }
  };

  const getSourceLabel = () => {
    if (!report) return null;
    switch(report.source) {
      case 'transcribed': return "From your recording";
      case 'generated': return "AI-generated";
      case 'edited': return "AI-edited";
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-2xl w-full relative animate-fade-in-up flex flex-col max-h-[90vh]">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <Icon name="close" className="w-8 h-8" />
        </button>
        <h2 className="text-3xl font-black text-blue-600 mb-2 text-center">Book Report</h2>
        <h3 className="text-xl font-bold text-slate-700 mb-4 text-center">{story.title}</h3>

        {/* --- ADDED: Icon Key --- */}
        <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-2">
            {reportKeyItems.map(item => (
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
        {/* --- END ADDED --- */}

        <div className="flex-grow overflow-y-auto mb-6 relative">
          <textarea
            value={report?.text || ''}
            readOnly
            className="w-full h-48 p-4 pr-12 border-2 border-slate-200 rounded-lg bg-slate-50 text-slate-700 text-lg"
            placeholder="Your book report will appear here..."
          />
          {/* --- ADDED: Read Report Button --- */}
          <button
            onClick={handleReadReport}
            disabled={isSpeaking || !report || !report.text}
            className="absolute top-3 right-3 p-2 text-blue-500 rounded-full hover:bg-blue-100 disabled:text-gray-400 disabled:bg-transparent"
            title="Read report aloud"
          >
            <Icon name="speaker" className="w-7 h-7" />
          </button>
          {/* --- END ADDED --- */}
          
          {report && (
            <div className="text-right text-sm text-slate-500 italic mt-1">
              {getSourceLabel()}
            </div>
          )}
        </div>
        
        <div className="text-center h-8 mb-4">
          <p className={`text-lg font-semibold ${status === 'error' ? 'text-red-500' : 'text-slate-600'}`}>
            {getStatusMessage()}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-4">
          <button
            onClick={handleMicClick}
            disabled={isLoading || isSpeaking}
            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-xl transition shadow-lg
              ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-blue-500 text-white hover:bg-blue-600'}
              disabled:bg-gray-400 disabled:cursor-not-allowed`}
          >
            <Icon name={isRecording ? "check" : "microphone"} className="w-6 h-6" />
            <span>{isRecording ? "Stop" : "Speak"}</span>
          </button>
          
          <button
            onClick={handleGenerateReport}
            disabled={isLoading || isSpeaking}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-purple-500 text-white rounded-full font-bold text-xl hover:bg-purple-600 transition shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <Icon name="idea" className="w-6 h-6" />
            <span>Generate</span>
          </button>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
           <button
            onClick={handleEditReport}
            disabled={isLoading || isSpeaking || !report || report.source !== 'transcribed'}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-full font-semibold text-lg hover:bg-yellow-600 transition shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <Icon name="star" className="w-5 h-5" />
            <span>Edit My Report</span>
          </button>
          <button
            onClick={handleCopyReport}
            disabled={isLoading || isSpeaking || !report}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-500 text-white rounded-full font-semibold text-lg hover:bg-slate-600 transition shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <Icon name="share" className="w-5 h-5" />
            <span>Copy</span>
          </button>
          <button
            onClick={handleSaveReport}
            disabled={isLoading || isSpeaking || !report || !user}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-full font-semibold text-lg hover:bg-green-600 transition shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <Icon name="save" className="w-5 h-5" />
            <span>Save</span>
          </button>
        </div>
        
      </div>
    </div>
  );
};

export default BookReportModal;