import React, { useState } from 'react';
import { UserData } from '../types'; // We will create this type
import Icon from './Icon';
import { logout } from '../services/authService';

interface UserProfileProps {
  user: UserData;
  onUpgradeClick: () => void;
  onCancelSubscription: () => void;
  isCancelling: boolean;
}

const getSubscriptionDetails = (subscriptionStatus: string) => {
  if (subscriptionStatus === 'lite') {
    return { name: "KidReads Lite", maxCredits: 10, color: "text-blue-500" };
  }
  if (subscriptionStatus === 'max') {
    return { name: "KidReads Max", maxCredits: 25, color: "text-purple-500" };
  }
  return { name: "Free Tier", maxCredits: 5, color: "text-gray-600" };
};

// Helper function to get initials and a background color
const getInitialsPlaceholder = (name: string | null | undefined) => {
  if (!name) return { initials: '?', color: 'bg-gray-400' };
  const initials = name.charAt(0).toUpperCase();
  // Simple hash function for color generation (adjust as needed)
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'];
  const colorIndex = Math.abs(hash % colors.length);
  return { initials, color: colors[colorIndex] };
};

const UserProfile: React.FC<UserProfileProps> = ({
  user,
  onUpgradeClick,
  onCancelSubscription,
  isCancelling,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { name, maxCredits, color } = getSubscriptionDetails(user.subscription);
  const currentCredits = user.usage?.credits ?? 0;
  const percentage = maxCredits > 0 ? (currentCredits / maxCredits) * 100 : 0;

  const isPlaceholderUrl = user.photoURL === "https://lh3.googleusercontent.com/a/ACg8ocIXMPVF4sbANVCxU5xZhZGtAsRFe5tDEvTCtdow1epo3YQJKA=s96-c";
  const { initials, color: placeholderColor } = getInitialsPlaceholder(user.displayName);

  console.log("UserProfile user data:", user);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 bg-slate-200 text-slate-700 rounded-full font-bold text-base md:text-lg hover:bg-slate-300 transition"
        aria-label="Open user profile"
      >
        {user.photoURL && !isPlaceholderUrl ? (
          // Case 1: Real Photo URL exists
          <img
            src={user.photoURL}
            alt="Profile"
            className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover"
          />
        ) : user.displayName ? (
           // Case 2: Placeholder URL or No URL, but DisplayName exists
          <div
            className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white font-bold text-lg md:text-xl ${placeholderColor}`}
          >
            {initials}
          </div>
        ) : (
          // Case 3: No Photo URL and No DisplayName
          <Icon name="user" className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-gray-400 p-1 text-white" />
        )}
        <span className="hidden sm:inline mr-2">{user.displayName?.split(' ')[0] || 'Profile'}</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4"
          role="dialog"
          aria-modal="true"
        >
          {/* ... Modal content remains the same ... */}
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md animate-fade-in-down flex flex-col max-h-[90vh]">
            {/* ... Modal Header ... */}
             <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-2xl font-bold text-gray-900">My Profile</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-800"
                aria-label="Close profile"
              >
                <Icon name="close" className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {/* --- MODIFIED: Show placeholder in modal too --- */}
              <div className="flex justify-center">
                {user.photoURL && !isPlaceholderUrl ? (
                  <img src={user.photoURL} alt="Profile" className="w-24 h-24 rounded-full" />
                ) : user.displayName ? (
                   <div className={`w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-4xl ${placeholderColor}`}>
                     {initials}
                   </div>
                ) : (
                   <div className="w-24 h-24 rounded-full flex items-center justify-center bg-gray-400">
                     <Icon name="user" className="w-16 h-16 text-white" />
                   </div>
                )}
              </div>
              {/* --- END MODIFIED --- */}

              <h3 className="text-xl font-semibold text-center">{user.displayName}</h3>
              <p className="text-center text-gray-500">{user.email}</p>

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-500">Account Type</h3>
                <p className={`text-lg font-semibold ${color}`}>{name}</p>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-500">Today's Credits</h3>
                <p className="text-2xl font-bold text-slate-800">
                  {currentCredits} / {maxCredits}
                </p>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                  <div
                    className="bg-blue-500 h-2.5 rounded-full"
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
                 <p className="text-xs text-gray-500 mt-1">Credits reset daily (UTC).</p>
              </div>
            </div>

            <div className="flex justify-between items-center p-4 border-t">
              {/* ... Modal Footer Buttons ... */}
               <button onClick={logout} className="px-4 py-2 bg-gray-500 text-white font-bold rounded-lg hover:bg-gray-600 text-sm">
                Sign Out
              </button>
              {user.subscription === "free" ? (
                <button onClick={onUpgradeClick} className="px-4 py-2 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 text-sm">
                  Upgrade
                </button>
              ) : (
                <button onClick={onCancelSubscription} className="px-4 py-2 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 text-sm" disabled={isCancelling}>
                  {isCancelling ? "Loading..." : "Manage Plan"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UserProfile;