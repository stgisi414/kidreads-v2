import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { loginWithGoogle, logout } from '../services/authService';
import Icon from './Icon';

type HeaderProps = {
  onGoHome: () => void;
  user: User | null;
};

const BrowserErrorModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="modal-overlay">
    <div className="modal-content">
      <h2 className="modal-title" style={{ color: '#e53e3e' }}>Unsupported Browser</h2>
      <p>To sign in with Google, you must open this page in your phone's main browser (e.g., Safari or Chrome).</p>
      <p style={{ fontSize: '0.9rem', marginTop: '1rem', color: '#a0aec0' }}>
        <strong>Instructions:</strong> Tap the 'More' or 'Share' button in the browser toolbar and select 'Open in Safari' or 'Open in default browser'.
      </p>
      <button onClick={onClose} className="button" style={{ marginTop: '1.5rem' }}>
        OK
      </button>
    </div>
  </div>
);

const Header: React.FC<HeaderProps> = ({ onGoHome, user }) => {
  const [showBrowserError, setShowBrowserError] = useState(false);

  const isDisallowedUserAgent = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = userAgent.includes('iphone') || userAgent.includes('ipad');
    const isAndroid = userAgent.includes('android');

    if (isIos) {
        const isNaverIOS = userAgent.includes('naver(inapp;');
        const isGenericIOSWebView = !userAgent.includes('safari') && !userAgent.includes('crios');
        return isNaverIOS || isGenericIOSWebView;
    }
    if (isAndroid) {
        const isNaverAndroid = userAgent.includes('naver');
        const isGenericAndroidWebView = userAgent.includes('wv');
        return isNaverAndroid || isGenericAndroidWebView;
    }
    return false;
  };

  const signIn = async () => {
    if (isDisallowedUserAgent()) {
      setShowBrowserError(true);
      return;
    }
    try {
      // We now call the original login function here
      await loginWithGoogle();
    } catch (error) {
      console.error("Error during sign in:", error);
      setShowBrowserError(true);
    }
  };

  return (
    <>
      <header className="w-full flex justify-between items-center p-4">
        <button
          onClick={onGoHome}
          className="flex items-center justify-center gap-2 md:gap-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-lg"
          aria-label="Go to home screen"
        >
          <img src="/logo.png" alt="KidReads Logo" className="h-10 md:h-12 w-auto" />
          <h1 className="text-3xl md:text-4xl font-black text-blue-600">KidReads</h1>
        </button>
        <div>
          {user ? (
            <button onClick={logout} className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 bg-blue-500 text-white rounded-full font-bold text-base md:text-lg hover:bg-blue-600 transition">
              <Icon name="logout" className="w-5 h-5 md:w-6 md:h-6" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          ) : (
              <button onClick={signIn} className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2 bg-blue-500 text-white rounded-full font-bold text-base md:text-lg hover:bg-blue-600 transition">
                <Icon name="login" className="w-5 h-5 md:w-6 md:h-6" />
                <span className="hidden sm:inline">Login</span>
              </button>
          )}
        </div>
      </header>

      {showBrowserError && <BrowserErrorModal onClose={() => setShowBrowserError(false)} />}
    </>
  );
};

export default Header;