import React, { useState, useEffect } from 'react';
import { UserData, ClassroomData } from '../types'; // Ensure UserData includes isAdmin? boolean
import Icon from './Icon'; //
import { logout } from '../services/authService';
import {
  getClassroomData,
  addStudentToClassroom,
  removeStudentFromClassroom
} from '../services/firestoreService';
import { getCreditsForSubscription, defaultUsage } from '../hooks/useAuth'; // Import defaultUsage

// --- Helper to get subscription details ---
const getSubscriptionDetails = (user: UserData) => {
  const isAdmin = user.isAdmin || user.subscription === 'admin';
  if (isAdmin) {
    return { name: "Admin Account", maxCredits: Infinity, color: "text-red-600 font-bold" };
  }
  if (user.subscription === 'classroom') {
    const isTeacher = !!user.classroomUsage?.teacher;
    if (isTeacher) {
        return { name: "Classroom Plan (Teacher)", maxCredits: 30, color: "text-orange-500" };
    } else {
        return { name: "Classroom Plan (Student)", maxCredits: 10, color: "text-green-500" };
    }
  }
  if (user.subscription === 'lite') {
    return { name: "KidReads Lite", maxCredits: 10, color: "text-blue-500" };
  }
  if (user.subscription === 'max') {
    return { name: "KidReads Max", maxCredits: 25, color: "text-purple-500" };
  }
  return { name: "Free Tier", maxCredits: 5, color: "text-gray-600" };
};

// --- Helper for profile picture/initials ---
const getInitialsPlaceholder = (name: string | null | undefined) => {
    if (!name) return { initials: '?', color: 'bg-gray-400' };
    const initials = name.charAt(0).toUpperCase();
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'];
    const colorIndex = Math.abs(hash % colors.length);
    return { initials, color: colors[colorIndex] };
};

interface UserProfileProps {
  user: UserData;
  onUpgradeClick: () => void;
  onManageSubscription: () => void;
  isManagingSubscription: boolean;
}

const UserProfile: React.FC<UserProfileProps> = ({
  user,
  onUpgradeClick,
  onManageSubscription,
  isManagingSubscription,
}) => {
  // --- RESTORED State variables ---
  const [isOpen, setIsOpen] = useState(false);
  const [students, setStudents] = useState<string[]>([]);
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [classroomLoading, setClassroomLoading] = useState(false);
  const [classroomError, setClassroomError] = useState<string | null>(null);
  const [classroomMessage, setClassroomMessage] = useState<string | null>(null);
  // --- END RESTORED ---

  // --- Details derived from props ---
  const { name, maxCredits, color } = getSubscriptionDetails(user);
  const isAdmin = user.isAdmin || user.subscription === 'admin';
  const isClassroomTeacher = user.subscription === 'classroom' && !!user.classroomUsage?.teacher;

  // --- Credit display logic (uses value from useAuth) ---
  const usageData = isClassroomTeacher ? user.classroomUsage?.teacher : user.usage;
  const displayCredits = usageData?.credits ?? 0; // Use 0 as fallback
  const creditLimit = maxCredits; // Denominator for display
  const lastResetTimestamp = usageData?.lastReset || 0; // For calculating next reset time

  const percentage = creditLimit > 0 && creditLimit !== Infinity ? (displayCredits / creditLimit) * 100 : (displayCredits === -1 ? 100 : 0);

  // --- RESTORED Derived constants for display ---
  const isPlaceholderUrl = user.photoURL === "https://lh3.googleusercontent.com/a/ACg8ocIXMPVF4sbANVCxU5xZhZGtAsRFe5tDEvTCtdow1epo3YQJKA=s96-c";
  const { initials, color: placeholderColor } = getInitialsPlaceholder(user.displayName);
  const displayNameAvailable = !!user.displayName;
  // --- END RESTORED ---

  // --- Calculate next reset time ---
  const getNextResetTime = () => {
    if (lastResetTimestamp === 0) {
      const now = new Date();
      const nextResetUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      return nextResetUTC.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    const lastResetDate = new Date(lastResetTimestamp);
    const nextResetUTC = new Date(Date.UTC(
        lastResetDate.getUTCFullYear(),
        lastResetDate.getUTCMonth(),
        lastResetDate.getUTCDate() + 1
    ));
    return nextResetUTC.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };
  const nextResetLocalTime = getNextResetTime();
  // --- END Calculate next reset time ---

  // --- RESTORED Classroom Data Fetching ---
  useEffect(() => {
    if (isOpen && isClassroomTeacher) { // Only fetch if teacher
      setClassroomLoading(true);
      getClassroomData(user.uid)
        .then(data => {
          if (data) {
            setStudents(data.students || []);
          } else {
             setClassroomError("Could not load classroom data.");
             setStudents([]);
          }
        })
        .catch(err => {
            console.error("Error fetching classroom data:", err);
            setClassroomError("Failed to load student list.");
        })
        .finally(() => setClassroomLoading(false));
    } else {
        setStudents([]);
        setNewStudentEmail('');
        setClassroomError(null);
        setClassroomMessage(null);
    }
  }, [isOpen, isClassroomTeacher, user.uid]); // Depend on isClassroomTeacher now
  // --- END RESTORED ---

  // --- RESTORED Classroom Management Functions ---
  const handleAddStudent = async () => {
    if (!newStudentEmail.trim() || !user) return;
    setClassroomLoading(true);
    setClassroomError(null);
    setClassroomMessage(null);
    const result = await addStudentToClassroom(user.uid, newStudentEmail.trim());
    setClassroomLoading(false);
    if (result.success) {
      setStudents(prev => [...prev, newStudentEmail.trim()]);
      setNewStudentEmail('');
      setClassroomMessage(result.message);
    } else {
      setClassroomError(result.message);
    }
    setTimeout(() => { setClassroomMessage(null); setClassroomError(null); }, 3000);
  };

  const handleRemoveStudent = async (emailToRemove: string) => {
    if (!user) return;
    setClassroomLoading(true);
    setClassroomError(null);
    setClassroomMessage(null);
    const result = await removeStudentFromClassroom(user.uid, emailToRemove);
    setClassroomLoading(false);
    if (result.success) {
      setStudents(prev => prev.filter(email => email !== emailToRemove));
      setClassroomMessage(result.message);
    } else {
      setClassroomError(result.message);
    }
     setTimeout(() => { setClassroomMessage(null); setClassroomError(null); }, 3000);
  };
  // --- END RESTORED ---

  console.log("UserProfile user data:", user);
  console.log("Calculated displayCredits:", displayCredits);

  return (
    <>
      {/* Button to open the modal */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 bg-slate-200 text-slate-700 rounded-full font-bold text-base md:text-lg hover:bg-slate-300 transition"
        aria-label="Open user profile"
      >
        {user.photoURL && !isPlaceholderUrl ? (
          <img
            src={user.photoURL}
            alt="Profile"
            className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover"
          />
        ) : displayNameAvailable ? (
           <div
            className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white font-bold text-lg md:text-xl ${placeholderColor}`}
          >
            {initials}
          </div>
        ) : (
          <Icon name="user" className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-gray-400 p-1 text-white" />
        )}
        <span className="hidden sm:inline mr-2">{user.displayName?.split(' ')[0] || 'Profile'}</span>
      </button>

      {/* The Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md animate-fade-in-down flex flex-col max-h-[90vh]">
             {/* Modal Header */}
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

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Profile Pic/Initials Block */}
              <div className="flex justify-center">
                {user.photoURL && !isPlaceholderUrl ? (
                  <img src={user.photoURL} alt="Profile" className="w-24 h-24 rounded-full object-cover" />
                ) : displayNameAvailable ? (
                   <div className={`w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-4xl ${placeholderColor}`}>
                     {initials}
                   </div>
                ) : (
                   <div className="w-24 h-24 rounded-full flex items-center justify-center bg-gray-400">
                     <Icon name="user" className="w-16 h-16 text-white" />
                   </div>
                )}
              </div>

              {/* Name and Email */}
              <h3 className="text-xl font-semibold text-center">{user.displayName}</h3>
              <p className="text-center text-gray-500">{user.email}</p>

              {/* Account Type */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-500">Account Type</h3>
                <p className={`text-lg font-semibold ${color}`}>{name}</p>
              </div>

              {/* Credits Section */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-500">Today's Credits</h3>
                {isAdmin || displayCredits === -1 ? (
                   <p className="text-2xl font-bold text-red-600">Unlimited</p>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-slate-800">
                      {displayCredits} / {creditLimit}
                    </p>
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                      <div
                        className="bg-blue-500 h-2.5 rounded-full"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </>
                )}
                 {!isAdmin && displayCredits !== -1 && (
                     <p className="text-xs text-gray-500 mt-1">
                         Credits reset daily around {nextResetLocalTime} your time.
                     </p>
                 )}
              </div>

              {/* Classroom Management Section */}
              {isClassroomTeacher && (
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold text-gray-700 mb-3">Manage Classroom</h3>
                  {classroomLoading && <p className="text-sm text-gray-500">Loading students...</p>}
                  {classroomError && <p className="text-sm font-bold text-red-500 bg-red-100 p-2 rounded">{classroomError}</p>}
                  {classroomMessage && <p className="text-sm font-bold text-green-500 bg-green-100 p-2 rounded">{classroomMessage}</p>}
                  <div className="flex gap-2 mb-4 mt-2">
                    <input
                      type="email"
                      placeholder="Student email"
                      value={newStudentEmail}
                      onChange={(e) => setNewStudentEmail(e.target.value)}
                      className="flex-grow p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                      disabled={classroomLoading}
                    />
                    <button
                      onClick={handleAddStudent}
                      disabled={classroomLoading || !newStudentEmail.trim()}
                      className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-md hover:bg-blue-600 text-sm disabled:bg-gray-400"
                    >
                      {classroomLoading ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">Current Students ({students.length}/{getCreditsForSubscription('classroom', true)}):</p> {/* Assuming max students is same as teacher credits */}
                  <div className="max-h-40 overflow-y-auto border rounded-md p-2 bg-gray-50">
                    {students.length > 0 ? (
                      <ul className="space-y-1">
                        {students.map(email => (
                          <li key={email} className="flex justify-between items-center text-sm">
                            <span>{email}</span>
                            <button
                              onClick={() => handleRemoveStudent(email)}
                              disabled={classroomLoading}
                              className="p-1 text-red-500 hover:text-red-700 disabled:text-gray-400"
                              aria-label={`Remove ${email}`}
                            >
                              <Icon name="trash" className="w-4 h-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      !classroomLoading && <p className="text-sm text-gray-400 italic">No students added yet.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between items-center p-4 border-t">
              <button onClick={logout} className="px-4 py-2 bg-gray-500 text-white font-bold rounded-lg hover:bg-gray-600 text-sm">
                Sign Out
              </button>
              <div className="flex gap-2">
                {isAdmin ? (
                  <button disabled={true} className="px-4 py-2 bg-green-500 text-white font-bold rounded-lg text-sm opacity-50 cursor-not-allowed">
                      Upgrade
                  </button>
                ) : (user.subscription === "free" || (user.subscription === "classroom" && !isClassroomTeacher)) ? (
                  <button onClick={onUpgradeClick} className="px-4 py-2 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 text-sm">
                      Upgrade Plan
                  </button>
                ) : (
                  <>
                    <button onClick={onManageSubscription} className="px-4 py-2 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 text-sm" disabled={isManagingSubscription}>
                      {isManagingSubscription ? "Loading..." : "Manage Billing"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UserProfile;