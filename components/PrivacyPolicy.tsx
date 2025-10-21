import React from 'react';
import { Link } from 'react-router-dom';

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-sky-50 text-slate-800 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-6 text-blue-600">Privacy Policy</h1>
        <p className="text-sm text-gray-500">Last updated: October 20, 2025</p>

        <p className="my-4">
          Welcome to KidReads. We respect your privacy and are committed to protecting your personal data.
        </p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-4">1. Information We Collect</h2>
        <ul className="list-disc list-inside mb-4 space-y-2">
          <li>
            <strong>Identity and Contact Data:</strong> When you sign in using Google, we receive your email address, display name, and photo URL.
          </li>
          <li>
            <strong>Usage Data:</strong> We track your usage of credits to manage the limits of our tiers.
          </li>
          <li>
            <strong>Transaction Data:</strong> We do NOT collect or store your payment card details. All payment processing is handled by our third-party payment processor, Stripe. We only store a customer ID from Stripe to manage your subscription status.
          </li>
        </ul>

        <h2 className="text-2xl font-semibold mt-6 mb-4">2. How We Use Your Information</h2>
        <ul className="list-disc list-inside mb-4 space-y-2">
            <li>Authenticate and manage your user account.</li>
            <li>Provide, operate, and maintain our application's services.</li>
            <li>Enforce credit limits on our tiers.</li>
            <li>Process transactions and manage your subscription via Stripe.</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-6 mb-4">3. Third-Party Services</h2>
        <ul className="list-disc list-inside mb-4 space-y-2">
          <li><strong>Firebase (by Google):</strong> Used for authentication and database (Firestore).</li>
          <li><strong>Google Gemini:</strong> Powers our story and illustration generation.</li>
          <li><strong>Stripe:</strong> Our payment processing partner.</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-6 mb-4">4. Contact Us</h2>
        <p className="mb-4">
          If you have any questions about this Privacy Policy, please contact us at support@kidreads.app.
        </p>

        <div className="mt-8">
          <Link to="/" className="text-blue-500 hover:underline">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;