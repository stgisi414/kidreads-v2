import React from 'react';
import Icon from './Icon';
import { UserData } from '../types';

interface SubscriptionModalProps {
  onClose: () => void;
  onSubscribe: (priceId: string) => void;
  reason: 'limit' | 'manual';
  isUpgrading: boolean;
  user: UserData | null;
}

const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ onClose, onSubscribe, reason, isUpgrading, user }) => {
  const title = reason === 'limit' ? "Daily Credits Reached" : "Upgrade Your Plan";
  const message = reason === 'limit'
    ? "You've used all your credits for today. Upgrade for more or manage your classroom!"
    : "Choose a plan to get more daily credits for generating stories.";

  const isStudent = user?.subscription === 'classroom' && !user?.classroomUsage?.teacher;
  const currentUserSubscription = user?.subscription;
  const isTeacher = user?.subscription === 'classroom' && !!user?.classroomUsage?.teacher;

  // Define Price IDs
  const LITE_PRICE_ID = "price_1SKsbGGYNyUbUaQ6mvtfhQOz";
  const MAX_PRICE_ID = "price_1SKsbeGYNyUbUaQ6dj929NnQ";
  const CLASSROOM_PRICE_ID = "price_1SKsc1GYNyUbUaQ6B76P6UTv";

  // --- Determine if plans should be disabled ---
  const isLiteDisabled = isStudent || currentUserSubscription === 'lite';
  const isMaxDisabled = currentUserSubscription === 'max';
  const isClassroomDisabled = isTeacher; // Only disable if they are *already* the teacher

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl animate-fade-in-down relative max-h-[90vh] flex flex-col">
        {/* Close button, title, message */}
        <div className="p-8 pb-0 flex-shrink-0">
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800" aria-label="Close">
            <Icon name="close" className="w-6 h-6" />
          </button>
          <h2 className="text-3xl font-bold text-blue-600 mb-4 text-center">{title}</h2>
          <p className="text-gray-700 mb-8 text-center">{message}</p>
        </div>

        <div className="px-8 pb-8 overflow-y-auto flex-grow">
          {/* Always use 3 columns now */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* KidReads Lite Plan */}
            <div className={`border-2 rounded-lg p-6 flex flex-col items-center shadow-lg transition-opacity duration-300 ${isLiteDisabled ? 'opacity-50 bg-gray-100 border-gray-300' : 'border-blue-500'}`}>
              <h3 className={`text-2xl font-bold mb-3 ${isLiteDisabled ? 'text-gray-500' : 'text-blue-500'}`}>KidReads Lite</h3>
              <p className={`text-4xl font-extrabold mb-4 ${isLiteDisabled ? 'text-gray-700' : 'text-slate-800'}`}>
                10
                <span className={`text-xl font-normal ${isLiteDisabled ? 'text-gray-500' : 'text-gray-600'}`}> credits/day</span>
              </p>
              <p className={`text-lg font-semibold mb-4 ${isLiteDisabled ? 'text-gray-600' : 'text-gray-700'}`}>$10 / month</p>
              <ul className={`space-y-2 mb-6 text-sm flex-grow ${isLiteDisabled ? 'text-gray-600' : 'text-gray-700'}`}>
                <li className="flex items-center"><Icon name="check" className={`w-4 h-4 mr-2 flex-shrink-0 ${isLiteDisabled ? 'text-gray-400' : 'text-green-500'}`} /> 10 Daily Credits</li>
                <li className="flex items-center"><Icon name="check" className={`w-4 h-4 mr-2 flex-shrink-0 ${isLiteDisabled ? 'text-gray-400' : 'text-green-500'}`} /> Save Stories</li>
              </ul>
              <button
                onClick={() => !isLiteDisabled && onSubscribe(LITE_PRICE_ID)}
                className={`w-full mt-auto px-6 py-3 text-white font-bold rounded-lg transition-colors text-lg ${isLiteDisabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'}`}
                disabled={isUpgrading || isLiteDisabled} // Disable if upgrading or plan is disabled
              >
                {isLiteDisabled ? (currentUserSubscription === 'lite' ? 'Current Plan' : 'Unavailable') : (isUpgrading ? "Redirecting..." : "Go Lite")}
              </button>
            </div>

            {/* KidReads Max Plan */}
            <div className={`border-2 rounded-lg p-6 flex flex-col items-center shadow-lg transition-opacity duration-300 ${isMaxDisabled ? 'opacity-50 bg-gray-100 border-gray-300' : 'border-purple-500'}`}>
              <h3 className={`text-2xl font-bold mb-3 ${isMaxDisabled ? 'text-gray-500' : 'text-purple-500'}`}>KidReads Max</h3>
              <p className={`text-4xl font-extrabold mb-4 ${isMaxDisabled ? 'text-gray-700' : 'text-slate-800'}`}>
                25
                <span className={`text-xl font-normal ${isMaxDisabled ? 'text-gray-500' : 'text-gray-600'}`}> credits/day</span>
              </p>
              <p className={`text-lg font-semibold mb-4 ${isMaxDisabled ? 'text-gray-600' : 'text-gray-700'}`}>$20 / month</p>
              <ul className={`space-y-2 mb-6 text-sm flex-grow ${isMaxDisabled ? 'text-gray-600' : 'text-gray-700'}`}>
                <li className="flex items-center"><Icon name="check" className={`w-4 h-4 mr-2 flex-shrink-0 ${isMaxDisabled ? 'text-gray-400' : 'text-green-500'}`} /> 25 Daily Credits</li>
                <li className="flex items-center"><Icon name="check" className={`w-4 h-4 mr-2 flex-shrink-0 ${isMaxDisabled ? 'text-gray-400' : 'text-green-500'}`} /> Save Stories</li>
              </ul>
              <button
                onClick={() => !isMaxDisabled && onSubscribe(MAX_PRICE_ID)}
                className={`w-full mt-auto px-6 py-3 text-white font-bold rounded-lg transition-colors text-lg ${isMaxDisabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-500 hover:bg-purple-600'}`}
                disabled={isUpgrading || isMaxDisabled}
              >
                {isMaxDisabled ? 'Current Plan' : (isUpgrading ? "Redirecting..." : "Go Max")}
              </button>
            </div>

            {/* KidReads Classroom Plan */}
            <div className={`border-2 rounded-lg p-6 flex flex-col items-center shadow-lg transition-opacity duration-300 ${isClassroomDisabled ? 'opacity-50 bg-gray-100 border-gray-300' : 'border-orange-500'}`}>
              <h3 className={`text-2xl font-bold mb-3 ${isClassroomDisabled ? 'text-gray-500' : 'text-orange-500'}`}>Classroom</h3>
               <p className={`text-4xl font-extrabold mb-1 ${isClassroomDisabled ? 'text-gray-700' : 'text-slate-800'}`}>
                <span className="text-2xl">Teacher:</span> 30
              </p>
              <p className={`text-4xl font-extrabold mb-4 ${isClassroomDisabled ? 'text-gray-700' : 'text-slate-800'}`}>
                 <span className="text-2xl">Students:</span> 10<span className="text-xl font-normal">ea</span>
                 <span className={`text-xl font-normal ${isClassroomDisabled ? 'text-gray-500' : 'text-gray-600'}`}> /day</span>
              </p>
              <p className={`text-lg font-semibold mb-4 ${isClassroomDisabled ? 'text-gray-600' : 'text-gray-700'}`}>$40 / month</p>
              <ul className={`space-y-2 mb-6 text-sm flex-grow ${isClassroomDisabled ? 'text-gray-600' : 'text-gray-700'}`}>
                <li className="flex items-center"><Icon name="check" className={`w-4 h-4 mr-2 flex-shrink-0 ${isClassroomDisabled ? 'text-gray-400' : 'text-green-500'}`} /> 1 Teacher Account</li>
                <li className="flex items-center"><Icon name="check" className={`w-4 h-4 mr-2 flex-shrink-0 ${isClassroomDisabled ? 'text-gray-400' : 'text-green-500'}`} /> Up to 20 Student Accounts</li>
                <li className="flex items-center"><Icon name="check" className={`w-4 h-4 mr-2 flex-shrink-0 ${isClassroomDisabled ? 'text-gray-400' : 'text-green-500'}`} /> Teacher: 30 Daily Credits</li>
                <li className="flex items-center"><Icon name="check" className={`w-4 h-4 mr-2 flex-shrink-0 ${isClassroomDisabled ? 'text-gray-400' : 'text-green-500'}`} /> Students: 10 Daily Credits Each</li>
                <li className="flex items-center"><Icon name="check" className={`w-4 h-4 mr-2 flex-shrink-0 ${isClassroomDisabled ? 'text-gray-400' : 'text-green-500'}`} /> Save Stories</li>
                <li className="flex items-center"><Icon name="check" className={`w-4 h-4 mr-2 flex-shrink-0 ${isClassroomDisabled ? 'text-gray-400' : 'text-green-500'}`} /> Classroom Management</li>
              </ul>
              <button
                onClick={() => !isClassroomDisabled && onSubscribe(CLASSROOM_PRICE_ID)}
                className={`w-full mt-auto px-6 py-3 text-white font-bold rounded-lg transition-colors text-lg ${isClassroomDisabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'}`}
                disabled={isUpgrading || isClassroomDisabled}
              >
                {isClassroomDisabled ? 'Current Plan' : (isUpgrading ? "Redirecting..." : "Go Classroom")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionModal;