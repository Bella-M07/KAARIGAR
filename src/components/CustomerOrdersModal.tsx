import React, { useEffect, useState } from 'react';
import {
  fetchMyOrders,
  fetchOrderMessages,
  sendOrderMessage,
  submitOrderReview,
} from '../lib/api';
import type { ChatMessage, PlacedOrder } from '../types';

interface CustomerOrdersModalProps {
  open: boolean;
  onClose: () => void;
  onReviewSubmitted: () => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const CustomerOrdersModal: React.FC<CustomerOrdersModalProps> = ({
  open,
  onClose,
  onReviewSubmitted,
}) => {
  const [orders, setOrders] = useState<PlacedOrder[]>([]);
  const [activeChatOrder, setActiveChatOrder] = useState<PlacedOrder | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgInput, setMsgInput] = useState('');

  const [reviewOrder, setReviewOrder] = useState<PlacedOrder | null>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadOrders = async () => {
    try {
      const list = await fetchMyOrders();
      setOrders(list);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!open) return;
    setActiveChatOrder(null);
    setReviewOrder(null);
    loadOrders();
  }, [open]);

  useEffect(() => {
    if (!open || !activeChatOrder) return;
    let mounted = true;
    const loadMsgs = async () => {
      const list = await fetchOrderMessages(activeChatOrder.id);
      if (mounted) setMessages(list);
    };
    loadMsgs();
    const t = window.setInterval(loadMsgs, 2500);
    return () => {
      mounted = false;
      window.clearInterval(t);
    };
  }, [open, activeChatOrder]);

  if (!open) return null;

  const handleSend = async () => {
    if (!activeChatOrder || !msgInput.trim()) return;
    const body = msgInput.trim();
    setMsgInput('');
    const list = await sendOrderMessage(activeChatOrder.id, body);
    setMessages(list);
  };

  const handleSaveReview = async () => {
    if (!reviewOrder) return;
    setSubmitting(true);
    try {
      await submitOrderReview(reviewOrder.id, {
        rating: stars,
        comment,
        photoDataUrl: photo,
      });
      setReviewOrder(null);
      setComment('');
      setPhoto(null);
      await loadOrders();
      onReviewSubmitted();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="ov on"
      role="dialog"
      aria-modal="true"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div className="sheet wide">
        <div className="sheet-top">
          <h3>
            {activeChatOrder
              ? `Chat · ${activeChatOrder.ownerName}`
              : reviewOrder
                ? `Review · ${reviewOrder.businessName}`
                : 'My Orders'}
          </h3>
          <button className="x" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {activeChatOrder ? (
          <>
            <div className="msgs">
              {messages.map((m) => (
                <div key={m.id} className={`b ${m.sender === 'customer' ? 'me2' : ''}`}>
                  {m.body}
                </div>
              ))}
            </div>
            <div className="addr">
              <input
                type="text"
                placeholder="Type a message"
                value={msgInput}
                onChange={(e) => setMsgInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
              />
              <button className="btn alt" type="button" onClick={handleSend}>
                Send
              </button>
            </div>
            <button
              className="btn ghost"
              type="button"
              onClick={() => setActiveChatOrder(null)}
            >
              Back to My Orders
            </button>
          </>
        ) : reviewOrder ? (
          <>
            <p>Your photo review builds {reviewOrder.ownerName}’s Trust Score.</p>
            <div className="stars-pick">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`star-btn ${n <= stars ? 'on' : ''}`}
                  onClick={() => setStars(n)}
                >
                  ★
                </button>
              ))}
            </div>
            <label>
              Your feedback
              <input
                type="text"
                maxLength={140}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Fresh, homemade and right on time!"
              />
            </label>
            <label className="drop">
              {photo ? 'Photo attached ✓ (tap to change)' : 'Tap to attach a photo'}
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setPhoto(await fileToDataUrl(f));
                }}
              />
            </label>
            <button className="btn alt" disabled={submitting} onClick={handleSaveReview}>
              {submitting ? 'Submitting…' : 'Submit review'}
            </button>
            <button className="btn ghost" type="button" onClick={() => setReviewOrder(null)}>
              Back
            </button>
          </>
        ) : orders.length === 0 ? (
          <div className="empty">
            You haven’t placed any orders yet. Pick a Kaarigar on the map to order!
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {orders.map((ord) => (
              <div key={ord.id} className="ord-card">
                <div className="ord-head">
                  <div>
                    <b>
                      {ord.emoji} {ord.businessName}
                    </b>
                    <small style={{ display: 'block', color: '#5b3a50' }}>
                      {ord.quantity} × {ord.serviceTitle} · ₹{ord.totalInr} ({ord.fulfilmentType})
                    </small>
                  </div>
                  <span className={`status-chip ${ord.status === 'completed' ? 'done' : ''}`}>
                    {ord.status}
                  </span>
                </div>
                <div className="mini-btns">
                  <a
                    className="mini-btn"
                    style={{ textDecoration: 'none' }}
                    href={`tel:+91${ord.unlockedPhone.replace(/\s/g, '')}`}
                  >
                    📞 Call {ord.unlockedPhone}
                  </a>
                  <button
                    type="button"
                    className="mini-btn fill"
                    onClick={() => setActiveChatOrder(ord)}
                  >
                    💬 Chat
                  </button>
                  {!ord.hasReview && (
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => setReviewOrder(ord)}
                    >
                      📸 Photo review
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
