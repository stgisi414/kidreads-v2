import React from 'react';
import { Link } from 'react-router-dom';

const TermsOfService: React.FC = () => {
  return (
    <div className="min-h-screen bg-sky-50 text-slate-800 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-6 text-blue-600">Terms of Service</h1>
        <p className="text-sm text-gray-500">Last updated: October 20, 2025</p>

        <p className="my-4">
          Please read these Terms of Service ("Terms", "Terms of Service") carefully before using the KidReads application (the "Service") operated by us ("us", "we", or "our"). Your access to and use of the Service is conditioned on your acceptance of and compliance with these Terms.
        </p>
        
        <h2 className="text-2xl font-semibold mt-6 mb-4">1. Accounts</h2>
        <p className="mb-4">
          To use our Service, you must create an account using Google's authentication service. You are responsible for safeguarding your account and for any activities or actions under your account.
        </p>

        <h2 className="text-2xl font-semibold mt-6 mb-4">2. Subscriptions and Credits</h2>
        <p className="mb-4">
          The Service offers a free tier and paid subscription plans ("KidReads Lite", "KidReads Max", "Kidreads Classroom").
        </p>
        <ul className="list-disc list-inside mb-4 space-y-2">
          <li>
            <strong>Credits:</strong> Story generation requires credits.
            <ul className="list-decimal list-inside ml-6">
              <li>Short Story: 1 Credit</li>
              <li>Medium Story: 2 Credits</li>
              <li>Long Story: 3 Credits</li>
              <li>Epic Story: 4 Credits</li>
            </ul>
          </li>
          <li>
            <strong>Tiers:</strong>
            <ul className="list-decimal list-inside ml-6">
              <li>Free Tier: 5 daily credits.</li>
              <li>KidReads Lite: 10 daily credits.</li>
              <li>KidReads Max: 25 daily credits.</li>
              <li>KidReads Student: 10 daily credits.</li>
              <li>KidReads Teacher: 30 daily credits.</li>
            </ul>
          </li>
          <li>
            <strong>Daily Reset:</strong> Unused daily credits do not roll over and are reset daily (based on UTC).
          </li>
          <li>
            <strong>Billing:</strong> Subscriptions are billed on a recurring basis (e.g., monthly). Payments are processed via Stripe.
          </li>
        </ul>

        <h2 className="text-2xl font-semibold mt-6 mb-4">3. Subscription Management and Cancellation</h2>
        <p className="mb-4">
          You can manage or cancel your subscription at any time through the Stripe customer billing portal, accessible from your profile on the home screen. Cancellations will take effect at the end of your current billing cycle.
        </p>

        <h2 className="text-2xl font-semibold mt-6 mb-4">4. Refund Policy</h2>
        <p className="font-bold mb-4">
          All payments are non-refundable. We do not offer refunds or credits for partial subscription periods or unused credits.
        </p>

        <h2 className="text-2xl font-semibold mt-6 mb-4">5. Termination</h2>
        <p className="mb-4">
          We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including if you breach the Terms.
        </p>

        <h2 className="text-2xl font-semibold mt-6 mb-4">6. Contact Us</h2>
        <p className="mb-4">
          If you have any questions about these Terms, please contact us at support@kidreads.app.
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

export default TermsOfService;