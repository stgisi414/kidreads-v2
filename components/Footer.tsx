import React from 'react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  return (
    <footer className="w-full max-w-4xl mx-auto p-4 mt-8 text-center text-gray-500 text-sm">
      <div className="flex justify-center gap-4">
        <Link to="/terms-of-service" className="hover:text-blue-500 hover:underline">
          Terms of Service
        </Link>
        <span>|</span>
        <Link to="/privacy-policy" className="hover:text-blue-500 hover:underline">
          Privacy Policy
        </Link>
      </div>
      <p className="mt-2">© {new Date().getFullYear()} KidReads. All rights reserved.</p>
    </footer>
  );
};

export default Footer;