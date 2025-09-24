import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="flex items-center justify-center gap-4 p-4">
      <img src="/logo.png" alt="KidReads Logo" className="h-12 w-auto" />
      <h1 className="text-4xl font-black text-blue-600">KidReads</h1>
    </header>
  );
};

export default Header;