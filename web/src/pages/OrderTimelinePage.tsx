import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

interface OrderEvent {
  id: number;
  order_id: string;
  event_type: string;
  description: string;
  old_value?: string;
  new_value?: string;
  user_id?: number;
  created_at: string;
}

const OrderTimelinePage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTimeline = async () => {
      if (!orderId) return;
      
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const response = await axios.get(`/orders/${orderId}/timeline`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setEvents(response.data);
        setError(null);
      } catch (err: any) {
        console.error('Failed to fetch timeline:', err);
        setError(err.response?.data?.detail || 'Failed to load order timeline');
      } finally {
        setLoading(false);
      }
    };

    fetchTimeline();
  }, [orderId]);

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'created':
        return '✨';
      case 'status_changed':
        return '🔄';
      case 'updated':
        return '✏️';
      case 'deleted':
        return '🗑️';
      default:
        return '📝';
    }
  };

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case 'created':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'status_changed':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'updated':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'deleted':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading timeline...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
        <button
          onClick={() => navigate('/orders')}
          className="text-blue-600 hover:underline"
        >
          ← Back to Orders
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Order Timeline</h1>
            <p className="text-gray-600 mt-1">Order ID: {orderId}</p>
          </div>
          <button
            onClick={() => navigate('/orders')}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            ← Back to Orders
          </button>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No events recorded for this order yet.
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200"></div>

            {/* Timeline events */}
            <div className="space-y-6">
              {events.map((event) => (
                <div key={event.id} className="relative flex items-start">
                  {/* Icon */}
                  <div
                    className={`shrink-0 w-16 h-16 rounded-full border-2 flex items-center justify-center text-2xl z-10 ${getEventColor(event.event_type)}`}
                  >
                    {getEventIcon(event.event_type)}
                  </div>

                  {/* Event card */}
                  <div className="ml-6 flex-1 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 capitalize">
                          {event.event_type.replace('_', ' ')}
                        </h3>
                        <p className="text-gray-700 mt-1">{event.description}</p>

                        {/* Show old/new values if available */}
                        {(event.old_value || event.new_value) && (
                          <div className="mt-2 text-sm">
                            {event.old_value && (
                              <span className="text-gray-500">
                                <span className="font-medium">From:</span> {event.old_value}
                              </span>
                            )}
                            {event.old_value && event.new_value && (
                              <span className="text-gray-400 mx-2">→</span>
                            )}
                            {event.new_value && (
                              <span className="text-gray-700">
                                <span className="font-medium">To:</span> {event.new_value}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="text-right ml-4">
                        <div className="text-sm text-gray-500">
                          {formatDate(event.created_at)}
                        </div>
                        {event.user_id && (
                          <div className="text-xs text-gray-400 mt-1">
                            User ID: {event.user_id}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
};

export default OrderTimelinePage;
