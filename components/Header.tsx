import React from 'react';

type HeaderProps = {
  onGoHome: () => void;
};

const Header: React.FC<HeaderProps> = ({ onGoHome }) => {
  return (
    <button
      onClick={onGoHome}
      className="flex items-center justify-center gap-4 p-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-lg"
      aria-label="Go to home screen"
    >
      <img src="/logo.png" alt="KidReads Logo" className="h-12 w-auto" />
      <h1 className="text-4xl font-black text-blue-600">KidReads</h1>
    </button>
  );
};

export default Header;