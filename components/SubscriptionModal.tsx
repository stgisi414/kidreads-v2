import React from 'react';
import Icon from './Icon';

interface SubscriptionModalProps {
  onClose: () => void;
  onSubscribe: (priceId: string) => void;
  reason: 'limit' | 'manual';
  isUpgrading: boolean;
}

const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ onClose, onSubscribe, reason, isUpgrading }) => {
  const title = reason === 'limit' ? "Daily Credits Reached" : "Upgrade Your Plan";
  const message = reason === 'limit'
    ? "You've used all your credits for today. Upgrade for more or manage your classroom!"
    : "Choose a plan to get more daily credits for generating stories.";

  // TODO: Replace with your actual Stripe Price IDs
  const LITE_PRICE_ID = "price_1SKZ12GYNyUbUaQ6sEcMRiKE";
  const MAX_PRICE_ID = "price_1SKZ0tGYNyUbUaQ6kUIoGtmD";
  const CLASSROOM_PRICE_ID = "price_1SKi4oGYNyUbUaQ6aCKPlfHv";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl animate-fade-in-down relative max-h-[90vh] flex flex-col">
        <div className="p-8 pb-0 flex-shrink-0">
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800" aria-label="Close">
            <Icon name="close" className="w-6 h-6" />
          </button>
          <h2 className="text-3xl font-bold text-blue-600 mb-4 text-center">{title}</h2>
          <p className="text-gray-700 mb-8 text-center">{message}</p>
        </div>

        {/* Changed grid layout to accommodate three plans */}
        <div className="px-8 pb-8 overflow-y-auto flex-grow">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* KidReads Lite Plan */}
            <div className="border-2 border-blue-500 rounded-lg p-6 flex flex-col items-center shadow-lg">              <h3 className="text-2xl font-bold text-blue-500 mb-3">KidReads Lite</h3>
              <p className="text-4xl font-extrabold text-slate-800 mb-4">
                10
                <span className="text-xl font-normal text-gray-600"> credits/day</span>
              </p>
               <p className="text-lg font-semibold text-gray-700 mb-4">$10 / month</p>
              <ul className="space-y-2 text-gray-700 mb-6 text-sm flex-grow">
                <li className="flex items-center"><Icon name="check" className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" /> 10 Daily Credits</li>
                <li className="flex items-center"><Icon name="check" className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" /> Save Stories</li>
              </ul>
              <button
                onClick={() => onSubscribe(LITE_PRICE_ID)}
                className="w-full mt-auto px-6 py-3 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition-colors text-lg"
                disabled={isUpgrading}
              >
                {isUpgrading ? "Redirecting..." : "Go Lite"}
              </button>
            </div>

            {/* KidReads Max Plan */}
            <div className="border-2 border-purple-500 rounded-lg p-6 flex flex-col items-center shadow-lg">
              <h3 className="text-2xl font-bold text-purple-500 mb-3">KidReads Max</h3>
              <p className="text-4xl font-extrabold text-slate-800 mb-4">
                25
                <span className="text-xl font-normal text-gray-600"> credits/day</span>
              </p>
               <p className="text-lg font-semibold text-gray-700 mb-4">$20 / month</p>
              <ul className="space-y-2 text-gray-700 mb-6 text-sm flex-grow">
                <li className="flex items-center"><Icon name="check" className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" /> 25 Daily Credits</li>
                <li className="flex items-center"><Icon name="check" className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" /> Save Stories</li>
              </ul>
              <button
                onClick={() => onSubscribe(MAX_PRICE_ID)}
                className="w-full mt-auto px-6 py-3 bg-purple-500 text-white font-bold rounded-lg hover:bg-purple-600 transition-colors text-lg"
                disabled={isUpgrading}
              >
                {isUpgrading ? "Redirecting..." : "Go Max"}
              </button>
            </div>

            {/* NEW: KidReads Classroom Plan */}
            <div className="border-2 border-orange-500 rounded-lg p-6 flex flex-col items-center shadow-lg">
              <h3 className="text-2xl font-bold text-orange-500 mb-3">Classroom</h3>
              <p className="text-4xl font-extrabold text-slate-800 mb-1">
                <span className="text-2xl">Teacher:</span> 30
              </p>
              <p className="text-4xl font-extrabold text-slate-800 mb-4">
                 <span className="text-2xl">Students:</span> 10<span className="text-xl font-normal">ea</span>
                 <span className="text-xl font-normal text-gray-600"> /day</span>
              </p>
              <p className="text-lg font-semibold text-gray-700 mb-4">$40 / month</p>
              <ul className="space-y-2 text-gray-700 mb-6 text-sm flex-grow">
                <li className="flex items-center"><Icon name="check" className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" /> 1 Teacher Account</li>
                <li className="flex items-center"><Icon name="check" className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" /> Up to 20 Student Accounts</li>
                <li className="flex items-center"><Icon name="check" className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" /> Teacher: 30 Daily Credits</li>
                <li className="flex items-center"><Icon name="check" className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" /> Students: 10 Daily Credits Each</li>
                <li className="flex items-center"><Icon name="check" className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" /> Save Stories</li>
                <li className="flex items-center"><Icon name="check" className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" /> Classroom Management</li>
              </ul>
              <button
                onClick={() => onSubscribe(CLASSROOM_PRICE_ID)}
                className="w-full mt-auto px-6 py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors text-lg"
                disabled={isUpgrading}
              >
                {isUpgrading ? "Redirecting..." : "Go Classroom"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionModal;