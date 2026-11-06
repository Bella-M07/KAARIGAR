import React, { useEffect, useState } from 'react';
import {
  createOrder,
  fetchOrderMessages,
  sendOrderMessage,
  submitOrderReview,
} from '../lib/api';
import type { AuthUser, ChatMessage, Kaarigar, PlacedOrder } from '../types';

interface OrderModalProps {
  kaarigar: Kaarigar | null;
  currentUser: AuthUser | null;
  onRequireLogin: () => void;
  onClose: () => void;
  onRefreshKaarigars: () => void;
}

type ModalView = 'p' | 'c' | 'd' | 'm' | 'r';

export const nearLabel = (d: number) => `~${Math.max(0.5, Math.round(d * 2) / 2)} km`;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const OrderModal: React.FC<OrderModalProps> = ({
  kaarigar,
  currentUser,
  onRequireLogin,
  onClose,
  onRefreshKaarigars,
}) => {
  const [view, setView] = useState<ModalView>('p');
  const [svcIdx, setSvcIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [fulfilmentType, setFulfilmentType] = useState<'pickup' | 'delivery'>('pickup');
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'cod'>('upi');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgInput, setMsgInput] = useState('');

  const [revStars, setRevStars] = useState(5);
  const [revComment, setRevComment] = useState('');
  const [revPhoto, setRevPhoto] = useState<string | null>(null);
  const [revResult, setRevResult] = useState<{ trustScore: number; rating: number } | null>(null);

  useEffect(() => {
    if (kaarigar) {
      setView('p');
      setSvcIdx(0);
      setQty(1);
      setFulfilmentType('pickup');
      setPaymentMethod('upi');
      setNote('');
      setErr('');
      setPlacedOrder(null);
      setMessages([]);
      setRevStars(5);
      setRevComment('');
      setRevPhoto(null);
      setRevResult(null);
    }
  }, [kaarigar?.id]);

  useEffect(() => {
    if (view !== 'm' || !placedOrder) return;
    let active = true;
    const load = async () => {
      const list = await fetchOrderMessages(placedOrder.id);
      if (active) setMessages(list);
    };
    load();
    const timer = window.setInterval(load, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [view, placedOrder]);

  if (!kaarigar) return null;

  const selectedService = kaarigar.services[svcIdx] ?? kaarigar.services[0];
  const totalInr = (selectedService?.priceInr ?? 0) * qty;
  const firstName = kaarigar.ownerName.split(' ')[0];
  const isOwnShop = currentUser?.kaarigarId === kaarigar.id;

  const handleProceedToCheckout = () => {
    if (!currentUser) {
      onRequireLogin();
      return;
    }
    setView('c');
  };

  const handlePlaceOrder = async () => {
    if (!selectedService) return;
    setSubmitting(true);
    setErr('');
    try {
      const order = await createOrder({
        kaarigarId: kaarigar.id,
        serviceId: selectedService.id,
        quantity: qty,
        fulfilmentType,
        paymentMethod,
        customerNote: note,
      });
      setPlacedOrder(order);
      setView('d');
      onRefreshKaarigars();
    } catch (e: any) {
      setErr(e.message ?? 'Could not place order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendChat = async () => {
    if (!placedOrder || !msgInput.trim()) return;
    const body = msgInput.trim();
    setMsgInput('');
    const updated = await sendOrderMessage(placedOrder.id, body);
    setMessages(updated);
  };

  const handleReviewSubmit = async () => {
    if (!placedOrder) return;
    setSubmitting(true);
    setErr('');
    try {
      const res = await submitOrderReview(placedOrder.id, {
        rating: revStars,
        comment: revComment,
        photoDataUrl: revPhoto,
      });
      setRevResult({ trustScore: res.trustScore, rating: res.rating });
      onRefreshKaarigars();
    } catch (e: any) {
      setErr(e.message ?? 'Could not submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="ov on"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <button className="x" onClick={onClose} aria-label="Close">
          ×
        </button>

        {view === 'p' && (
          <>
            <div className="hd">
              <div className="av" style={{ background: kaarigar.themeColor }}>
                {kaarigar.photos[0] ? (
                  <img src={kaarigar.photos[0]} alt={kaarigar.businessName} />
                ) : (
                  kaarigar.emoji
                )}
              </div>
              <div>
                <h3>{kaarigar.businessName}</h3>
                <small>
                  by {kaarigar.ownerName} · ★ {kaarigar.rating} ({kaarigar.reviewCount} reviews)
                </small>
                <small>
                  {nearLabel(kaarigar.distanceKm)} from you ({kaarigar.areaName}). Exact address stays
                  private.
                </small>
                <div className="trust-row">
                  <span className="trust-pill">
                    🛡️ Trust {kaarigar.trustScore}%{kaarigar.idVerified ? ' · ID Checked' : ''}
                  </span>
                  <span className="trust-pill">
                    🕒 {kaarigar.openTime}–{kaarigar.closeTime} · {kaarigar.ordersToday}/{kaarigar.dailyCap} today
                  </span>
                </div>
              </div>
            </div>

            <div className="ph2">
              {kaarigar.photos.length > 0
                ? kaarigar.photos.slice(0, 4).map((url, idx) => (
                    <div key={idx} style={{ background: kaarigar.themeColor }}>
                      <img src={url} alt={`${kaarigar.businessName} work ${idx + 1}`} />
                    </div>
                  ))
                : [kaarigar.emoji, '✨', '🌸', kaarigar.emoji].map((em, idx) => (
                    <div key={idx} style={{ background: kaarigar.themeColor }}>
                      {em}
                    </div>
                  ))}
            </div>

            <div className="opts">
              {kaarigar.services.map((svc, idx) => (
                <label key={svc.id} className="op">
                  <input
                    type="radio"
                    name="sv"
                    checked={idx === svcIdx}
                    onChange={() => setSvcIdx(idx)}
                  />
                  <span>{svc.title}</span>
                  <b>₹{svc.priceInr}</b>
                </label>
              ))}
            </div>

            {kaarigar.reviews.length > 0 && (
              <div className="ord-card">
                <small style={{ fontWeight: 600, color: '#3A1630' }}>
                  Recent neighbour review · ★ {kaarigar.reviews[0].rating}
                </small>
                <p style={{ fontSize: 14 }}>
                  “{kaarigar.reviews[0].comment || 'Fresh, hygienic and right on time!'}” —{' '}
                  {kaarigar.reviews[0].customerName}
                </p>
              </div>
            )}

            <button
              className="btn alt"
              disabled={!kaarigar.takingOrders || isOwnShop}
              onClick={handleProceedToCheckout}
            >
              {isOwnShop
                ? 'This is your own shop'
                : !kaarigar.takingOrders
                  ? 'Not taking orders today'
                  : currentUser
                    ? `Buy now · ₹${selectedService?.priceInr ?? 0}`
                    : `Log in to buy · ₹${selectedService?.priceInr ?? 0}`}
            </button>
            <p className="fine">Chat and call details unlock after you buy.</p>
          </>
        )}

        {view === 'c' && selectedService && (
          <>
            <h3>Checkout</h3>
            <div>
              <b>{selectedService.title}</b>
              <br />
              <small>
                {kaarigar.businessName} · Ordering as {currentUser?.name}
              </small>
            </div>

            <label>
              Quantity
              <span className="qt">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Less"
                >
                  −
                </button>
                <b>{qty}</b>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(20, q + 1))}
                  aria-label="More"
                >
                  +
                </button>
              </span>
            </label>

            <label>Fulfilment</label>
            <div className="opts">
              <label className="op">
                <input
                  type="radio"
                  name="fulfil"
                  checked={fulfilmentType === 'pickup'}
                  onChange={() => setFulfilmentType('pickup')}
                />
                <span>Self pickup near {kaarigar.areaName}</span>
              </label>
              <label className="op">
                <input
                  type="radio"
                  name="fulfil"
                  checked={fulfilmentType === 'delivery'}
                  onChange={() => setFulfilmentType('delivery')}
                />
                <span>Local society drop / delivery</span>
              </label>
            </div>

            <label>
              Note for {firstName}
              <input
                type="text"
                maxLength={120}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Timing, spice level, size, flat/society..."
              />
            </label>

            <div className="opts">
              <label className="op">
                <input
                  type="radio"
                  name="pay"
                  checked={paymentMethod === 'upi'}
                  onChange={() => setPaymentMethod('upi')}
                />
                <span>Pay with UPI</span>
              </label>
              <label className="op">
                <input
                  type="radio"
                  name="pay"
                  checked={paymentMethod === 'cod'}
                  onChange={() => setPaymentMethod('cod')}
                />
                <span>Cash on delivery</span>
              </label>
            </div>

            {err && <div className="err">{err}</div>}
            <div className="tot">
              <span>Total</span>
              <b>₹{totalInr}</b>
            </div>
            <button className="btn alt" disabled={submitting} onClick={handlePlaceOrder}>
              {submitting ? 'Placing order…' : 'Place order'}
            </button>
            <button className="btn ghost" type="button" onClick={() => setView('p')}>
              Back
            </button>
          </>
        )}

        {view === 'd' && placedOrder && (
          <>
            <h3>Order placed</h3>
            <p>
              {placedOrder.quantity} × {placedOrder.serviceTitle} from {placedOrder.businessName} (
              {placedOrder.fulfilmentType}). Total ₹{placedOrder.totalInr}.
            </p>
            <div className="ct">
              <b>Contact {placedOrder.ownerName}</b>
              <a
                className="btn alt"
                href={`tel:+91${placedOrder.unlockedPhone.replace(/\s/g, '')}`}
              >
                Call {placedOrder.unlockedPhone}
              </a>
              <button className="btn" type="button" onClick={() => setView('m')}>
                Chat in app
              </button>
              <button className="btn ghost" type="button" onClick={() => setView('r')}>
                📸 Leave a photo review
              </button>
            </div>
            <p className="fine">
              Exact pickup/drop coordination near {placedOrder.pickupArea} is now unlocked between you
              and your kaarigar.
            </p>
          </>
        )}

        {view === 'm' && placedOrder && (
          <>
            <h3>{placedOrder.ownerName}</h3>
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
                  if (e.key === 'Enter') handleSendChat();
                }}
              />
              <button className="btn alt" type="button" onClick={handleSendChat}>
                Send
              </button>
            </div>
            <button className="btn ghost" type="button" onClick={() => setView('d')}>
              Back
            </button>
          </>
        )}

        {view === 'r' && placedOrder && (
          <>
            <h3>Rate {placedOrder.businessName}</h3>
            {revResult ? (
              <div className="ct">
                <b>Thank you! Review saved ✨</b>
                <p>
                  {placedOrder.ownerName}’s Trust Score is now <b>{revResult.trustScore}%</b> (★{' '}
                  {revResult.rating}).
                </p>
                <button className="btn alt" type="button" onClick={onClose}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <p>Photo reviews verify quality and boost her neighbourhood Trust Score.</p>
                <div className="stars-pick" role="radiogroup" aria-label="Star rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`star-btn ${n <= revStars ? 'on' : ''}`}
                      onClick={() => setRevStars(n)}
                      aria-label={`${n} stars`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <label>
                  How was your order?
                  <input
                    type="text"
                    maxLength={140}
                    value={revComment}
                    onChange={(e) => setRevComment(e.target.value)}
                    placeholder="Warm rotis, super clean packaging!"
                  />
                </label>
                <label className="drop">
                  {revPhoto ? 'Photo attached ✓ (tap to change)' : 'Tap to add a photo of what you received'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setRevPhoto(await fileToDataUrl(f));
                    }}
                  />
                </label>
                {err && <div className="err">{err}</div>}
                <button className="btn alt" disabled={submitting} onClick={handleReviewSubmit}>
                  {submitting ? 'Saving review…' : 'Submit review'}
                </button>
                <button className="btn ghost" type="button" onClick={() => setView('d')}>
                  Back
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
