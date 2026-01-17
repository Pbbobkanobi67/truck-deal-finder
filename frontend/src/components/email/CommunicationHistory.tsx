'use client';

import { useState, useEffect } from 'react';

interface Communication {
  id: number;
  listing_id: number | null;
  dealer_name: string;
  dealer_email: string | null;
  gmail_thread_id: string | null;
  subject: string | null;
  body: string | null;
  direction: 'sent' | 'received';
  sent_at: string | null;
  received_at: string | null;
  status: string;
  created_at: string;
  make?: string;
  model?: string;
  year?: number;
  trim?: string;
}

interface CommunicationHistoryProps {
  onClose: () => void;
}

export default function CommunicationHistory({ onClose }: CommunicationHistoryProps) {
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedComm, setSelectedComm] = useState<Communication | null>(null);

  useEffect(() => {
    fetchCommunications();
  }, []);

  const fetchCommunications = async () => {
    try {
      const response = await fetch('/api/communications');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setCommunications(data);
    } catch (err) {
      setError('Failed to load communication history');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Communication History</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Email list */}
          <div className="w-1/2 border-r overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                Loading...
              </div>
            ) : error ? (
              <div className="p-8 text-center text-red-600">{error}</div>
            ) : communications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p>No emails sent yet.</p>
                <p className="text-sm mt-2">Send an email to a dealer to see it here.</p>
              </div>
            ) : (
              <div className="divide-y">
                {communications.map((comm) => (
                  <button
                    key={comm.id}
                    onClick={() => setSelectedComm(comm)}
                    className={`w-full p-4 text-left hover:bg-gray-50 transition ${
                      selectedComm?.id === comm.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 truncate">
                        {comm.dealer_name}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        comm.direction === 'sent'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {comm.direction}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 truncate">{comm.subject}</p>
                    {comm.year && comm.make && comm.model && (
                      <p className="text-xs text-gray-500 mt-1">
                        {comm.year} {comm.make} {comm.model} {comm.trim}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDate(comm.sent_at || comm.created_at)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Email detail */}
          <div className="w-1/2 overflow-y-auto bg-gray-50">
            {selectedComm ? (
              <div className="p-6">
                <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      selectedComm.direction === 'sent'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {selectedComm.direction === 'sent' ? 'Sent' : 'Received'}
                    </span>
                    <span className="text-sm text-gray-500">
                      {formatDate(selectedComm.sent_at || selectedComm.created_at)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-900 text-lg">{selectedComm.dealer_name}</h3>
                  {selectedComm.dealer_email && (
                    <p className="text-sm text-gray-600">{selectedComm.dealer_email}</p>
                  )}
                </div>

                {selectedComm.year && selectedComm.make && (
                  <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
                    <p className="text-sm text-gray-500">Vehicle</p>
                    <p className="font-medium text-gray-900">
                      {selectedComm.year} {selectedComm.make} {selectedComm.model} {selectedComm.trim}
                    </p>
                  </div>
                )}

                <div className="bg-white rounded-lg shadow-sm border p-4">
                  <p className="text-sm text-gray-500 mb-2">Subject</p>
                  <p className="font-medium text-gray-900 mb-4">{selectedComm.subject}</p>

                  <p className="text-sm text-gray-500 mb-2">Message</p>
                  <div
                    className="prose prose-sm max-w-none text-gray-700"
                    dangerouslySetInnerHTML={{ __html: selectedComm.body || '' }}
                  />
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8m-5 5h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293h3.172a1 1 0 00.707-.293l2.414-2.414a1 1 0 01.707-.293H20" />
                  </svg>
                  <p>Select an email to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
