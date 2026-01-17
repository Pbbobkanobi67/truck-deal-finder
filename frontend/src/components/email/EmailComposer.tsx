'use client';

import { useState } from 'react';
import type { Listing } from '@/types';

interface EmailComposerProps {
  listing: Listing | null;
  onClose: () => void;
  onSent?: () => void;
  isAuthenticated: boolean;
  onSignIn: () => void;
}

// Email templates
const EMAIL_TEMPLATES = {
  otdRequest: {
    name: 'OTD Price Request',
    subject: (listing: Listing) =>
      `OTD Price Request - ${listing.year} ${listing.make} ${listing.model} ${listing.trim || ''}`,
    body: (listing: Listing, userName: string, userPhone: string) => `
<p>Hello,</p>

<p>I am interested in the <strong>${listing.year} ${listing.make} ${listing.model} ${listing.trim || ''}</strong> you have listed.</p>

${listing.stock_number ? `<p><strong>Stock #:</strong> ${listing.stock_number}</p>` : ''}
${listing.vin ? `<p><strong>VIN:</strong> ${listing.vin}</p>` : ''}
${listing.price ? `<p><strong>Listed Price:</strong> $${listing.price.toLocaleString()}</p>` : ''}

<p>Could you please provide me with your best <strong>out-the-door (OTD) price</strong> including:</p>
<ul>
  <li>All taxes and fees</li>
  <li>Any current incentives or rebates</li>
  <li>Dealer fees</li>
</ul>

<p>I am pre-approved for financing and looking to purchase within the next week.</p>

<p>Thank you,<br>
${userName || '[Your Name]'}${userPhone ? `<br>${userPhone}` : ''}</p>
`,
  },
  competitive: {
    name: 'Competitive Price Match',
    subject: (listing: Listing) =>
      `Price Match Request - ${listing.year} ${listing.make} ${listing.model}`,
    body: (listing: Listing, userName: string, userPhone: string) => `
<p>Hello,</p>

<p>I am shopping for a <strong>${listing.year} ${listing.make} ${listing.model} ${listing.trim || ''}</strong> and have received competitive quotes from other dealers in the area.</p>

${listing.stock_number ? `<p><strong>Stock #:</strong> ${listing.stock_number}</p>` : ''}
${listing.price ? `<p><strong>Your Listed Price:</strong> $${listing.price.toLocaleString()}</p>` : ''}

<p>I would like to give you the opportunity to match or beat the best offer I've received. The competing quote is for a similarly equipped vehicle.</p>

<p>Please let me know your best OTD price, and I'm ready to move forward quickly with the right deal.</p>

<p>Thank you,<br>
${userName || '[Your Name]'}${userPhone ? `<br>${userPhone}` : ''}</p>
`,
  },
  inquiry: {
    name: 'General Inquiry',
    subject: (listing: Listing) =>
      `Inquiry - ${listing.year} ${listing.make} ${listing.model} ${listing.trim || ''}`,
    body: (listing: Listing, userName: string, userPhone: string) => `
<p>Hello,</p>

<p>I am interested in learning more about the <strong>${listing.year} ${listing.make} ${listing.model} ${listing.trim || ''}</strong> you have in stock.</p>

${listing.stock_number ? `<p><strong>Stock #:</strong> ${listing.stock_number}</p>` : ''}
${listing.vin ? `<p><strong>VIN:</strong> ${listing.vin}</p>` : ''}

<p>Could you please provide the following information:</p>
<ul>
  <li>Confirm availability</li>
  <li>Current pricing and any incentives</li>
  <li>Available financing options</li>
</ul>

<p>I look forward to hearing from you.</p>

<p>Thank you,<br>
${userName || '[Your Name]'}${userPhone ? `<br>${userPhone}` : ''}</p>
`,
  },
};

export default function EmailComposer({
  listing,
  onClose,
  onSent,
  isAuthenticated,
  onSignIn,
}: EmailComposerProps) {
  const [template, setTemplate] = useState<keyof typeof EMAIL_TEMPLATES>('otdRequest');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Apply template when listing or template changes
  const applyTemplate = () => {
    if (!listing) return;
    const tpl = EMAIL_TEMPLATES[template];
    setSubject(tpl.subject(listing).trim());
    setBody(tpl.body(listing, userName, userPhone));
  };

  const handleSend = async () => {
    if (!to || !subject || !body) {
      setError('Please fill in all fields');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          htmlBody: body,
          listingId: listing?.id,
          dealerName: listing?.dealer_name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email');
      }

      setSuccess(true);
      onSent?.();

      // Close after showing success
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Connect Gmail</h2>
          <p className="text-gray-600 mb-6">
            To send emails directly to dealers, please sign in with your Gmail account.
            This allows you to send emails from your own email address.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onSignIn}
              className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {success ? 'Email Sent!' : 'Compose Email'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="p-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-900">Email sent successfully!</p>
            <p className="text-gray-600 mt-2">Your message has been sent to the dealer.</p>
          </div>
        ) : (
          <>
            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* Listing info */}
              {listing && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <p className="font-medium text-gray-900">
                    {listing.year} {listing.make} {listing.model} {listing.trim}
                  </p>
                  <p className="text-sm text-gray-600">
                    {listing.dealer_name} {listing.price && `• $${listing.price.toLocaleString()}`}
                  </p>
                </div>
              )}

              {/* Template selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Template</label>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(EMAIL_TEMPLATES).map(([key, tpl]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setTemplate(key as keyof typeof EMAIL_TEMPLATES);
                        setTimeout(applyTemplate, 0);
                      }}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                        template === key
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Your info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="John Smith"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Phone (optional)</label>
                  <input
                    type="tel"
                    value={userPhone}
                    onChange={(e) => setUserPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={applyTemplate}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Apply template with your info
              </button>

              {/* To field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To (Dealer Email)</label>
                <input
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="dealer@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter the dealer&apos;s email address (check their website or listing page)
                </p>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t bg-gray-50 flex gap-3">
              <button
                onClick={handleSend}
                disabled={sending || !to || !subject || !body}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Send Email
                  </>
                )}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
