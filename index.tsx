(function() {
  try {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const currentUrl = window.location.href;
    
    // iOS Check
    const isIos = userAgent.includes('iphone') || userAgent.includes('ipad');
    if (isIos) {
      const isNaverIOS = userAgent.includes('naver(inapp;');
      const isGenericIOSWebView = !userAgent.includes('safari') && !userAgent.includes('crios');
      if (isNaverIOS || isGenericIOSWebView) {
        window.location.href = 'x-safari-' + currentUrl;
        return;
      }
    }

    // Android Check
    const isAndroid = userAgent.includes('android');
    if (isAndroid) {
      const isNaverAndroid = userAgent.includes('naver');
      const isGenericAndroidWebView = userAgent.includes('wv');
      if (isNaverAndroid || isGenericAndroidWebView) {
        const intentUrl = currentUrl.replace(/https?:\/\//, 'intent://');
        window.location.href = `${intentUrl}#Intent;scheme=https;package=com.android.chrome;end`;
      }
    }
  } catch (error) {
    console.error('In-app browser redirect failed:', error);
  }
})();

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
