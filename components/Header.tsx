import React from 'react';
import type { User } from 'firebase/auth';
import { loginWithGoogle, logout } from '../services/authService';

type HeaderProps = {
  onGoHome: () => void;
  user: User | null;
};

const Header: React.FC<HeaderProps> = ({ onGoHome, user }) => {
  return (
    <header className="w-full flex justify-between items-center p-4">
      <button
        onClick={onGoHome}
        className="flex items-center justify-center gap-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-lg"
        aria-label="Go to home screen"
      >
        <img src="/logo.png" alt="KidReads Logo" className="h-12 w-auto" />
        <h1 className="text-4xl font-black text-blue-600">KidReads</h1>
      </button>
      <div>
        {user ? (
          <button onClick={logout} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-full font-bold text-lg hover:bg-slate-300 transition">
            Logout
          </button>
        ) : (
          <button onClick={loginWithGoogle} className="px-4 py-2 bg-blue-500 text-white rounded-full font-bold text-lg hover:bg-blue-600 transition">
            Login
          </button>
        )}
      </div>
    </header>
  );
};