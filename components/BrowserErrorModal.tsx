import React from 'react';
import Icon from './Icon'; // Assuming you have an Icon component

interface BrowserErrorModalProps {
  onClose: () => void;
}

const BrowserErrorModal: React.FC<BrowserErrorModalProps> = ({ onClose }) => {
  return (
    // Overlay: fixed position, covers screen, centers content, backdrop
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
      {/* Modal Content Box */}
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative animate-fade-in-down">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-800"
          aria-label="Close"
        >
          <Icon name="close" className="w-6 h-6" />
        </button>

        {/* Modal Header */}
        <h2 className="text-2xl font-bold text-red-600 mb-4 text-center">
          Unsupported Browser
        </h2>

        {/* Modal Body */}
        <p className="text-gray-700 mb-3">
          To sign in with Google, please open this page in your phone's main browser (e.g., Safari or Chrome).
        </p>
        <p className="text-sm text-gray-500">
          <strong>Instructions:</strong> Tap the 'Share' or 'More options' button in your current browser and select 'Open in Safari' or 'Open in default browser'.
        </p>

        {/* Modal Footer/Action */}
        <div className="mt-6 text-center">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default BrowserErrorModal;