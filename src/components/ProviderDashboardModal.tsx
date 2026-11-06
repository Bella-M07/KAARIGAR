import React, { useEffect, useState } from 'react';
import {
  fetchMyDashboard,
  sendOrderMessage,
  updateMySettings,
  updateOrderStatus,
} from '../lib/api';
import type { ProviderDashboardData } from '../types';

interface ProviderDashboardModalProps {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  onNeedSetupShop: () => void;
}

export const ProviderDashboardModal: React.FC<ProviderDashboardModalProps> = ({
  open,
  onClose,
  onChanged,
  onNeedSetupShop,
}) => {
  const [data, setData] = useState<ProviderDashboardData | null>(null);
  const [err, setErr] = useState('');
  const [replyByOrder, setReplyByOrder] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await fetchMyDashboard();
      setData(res);
      setErr('');
    } catch (e: any) {
      setErr(e.message ?? 'Could not load dashboard');
    }
  };

  useEffect(() => {
    if (!open) return;
    load();
    const t = window.setInterval(load, 3500);
    return () => window.clearInterval(t);
  }, [open]);

  if (!open) return null;

  const p = data?.provider;
  const e = data?.earnings;

  const handleToggleOpen = async () => {
    if (!p) return;
    setSaving(true);
    await updateMySettings({ isOpen: !p.isOpen });
    await load();
    onChanged();
    setSaving(false);
  };

  const handleCapDelta = async (delta: number) => {
    if (!p) return;
    const nextCap = Math.max(1, p.dailyCap + delta);
    await updateMySettings({ dailyCap: nextCap });
    await load();
    onChanged();
  };

  const handleStatus = async (
    orderId: string,
    status: 'accepted' | 'ready' | 'completed' | 'cancelled'
  ) => {
    await updateOrderStatus(orderId, status);
    await load();
    onChanged();
  };

  const handleReply = async (orderId: string) => {
    const text = (replyByOrder[orderId] ?? '').trim();
    if (!text) return;
    setReplyByOrder((prev) => ({ ...prev, [orderId]: '' }));
    await sendOrderMessage(orderId, text);
    await load();
  };

  const capPct = p ? Math.min(100, Math.round((p.ordersToday / Math.max(1, p.dailyCap)) * 100)) : 0;

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
          <h3>My Shop Dashboard</h3>
          <button className="x" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {err && !p ? (
          <div className="ct">
            <p>{err}</p>
            <button
              type="button"
              className="btn alt"
              onClick={() => {
                onClose();
                onNeedSetupShop();
              }}
            >
              Complete my shop setup
            </button>
          </div>
        ) : p && e ? (
          <>
            <div className="ord-card">
              <div className="ord-head">
                <div>
                  <b style={{ fontFamily: 'Fraunces, serif', fontSize: 19 }}>
                    {p.emoji} {p.businessName}
                  </b>
                  <small style={{ display: 'block', color: '#5b3a50' }}>
                    Signed in as {p.ownerName} ({p.phone}) · {p.areaName}
                  </small>
                  <small style={{ display: 'block', color: '#5b3a50' }}>
                    🛡️ Trust {p.trustScore}% · ★ {p.rating} ({p.reviewCount}) · Hours {p.openTime}–
                    {p.closeTime}
                  </small>
                </div>
                <button
                  type="button"
                  className={`btn ${p.isOpen ? 'alt' : ''}`}
                  style={{ padding: '8px 16px', fontSize: 14 }}
                  disabled={saving}
                  onClick={handleToggleOpen}
                >
                  {p.isOpen ? '🟢 Taking orders (Pause)' : '⏸ Paused (Go live)'}
                </button>
              </div>

              <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                <div className="ord-head">
                  <small style={{ fontWeight: 600 }}>
                    Daily order limit: {p.ordersToday} / {p.dailyCap} orders today
                  </small>
                  <span className="qt" style={{ gap: 8 }}>
                    <button
                      type="button"
                      style={{ width: 28, height: 28, fontSize: 16 }}
                      onClick={() => handleCapDelta(-1)}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      style={{ width: 28, height: 28, fontSize: 16 }}
                      onClick={() => handleCapDelta(1)}
                    >
                      +
                    </button>
                  </span>
                </div>
                <div className="cap-bar">
                  <div className="cap-fill" style={{ width: `${capPct}%` }} />
                </div>
              </div>
            </div>

            <div className="stat-grid">
              <div className="stat-box">
                <b>₹{e.grossInr}</b>
                <small>Gross orders</small>
              </div>
              <div className="stat-box">
                <b>₹{e.commissionInr}</b>
                <small>Platform fee ({e.commissionRatePct}%)</small>
              </div>
              <div className="stat-box">
                <b>₹{e.netEarningsInr}</b>
                <small>Weekly UPI payout</small>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <b style={{ fontFamily: 'Fraunces, serif', fontSize: 18 }}>
                My incoming orders ({data.orders.length})
              </b>
              {data.orders.length === 0 ? (
                <p className="fine">No orders yet today. Keep your availability turned on!</p>
              ) : (
                data.orders.map((ord) => (
                  <div key={ord.id} className="ord-card">
                    <div className="ord-head">
                      <div>
                        <b>
                          {ord.quantity} × {ord.serviceTitle}
                        </b>{' '}
                        <small style={{ color: '#5b3a50' }}>
                          · ₹{ord.totalInr} ({ord.paymentMethod.toUpperCase()} · {ord.fulfilmentType})
                        </small>
                        <small style={{ display: 'block', color: '#5b3a50' }}>
                          Customer: {ord.customerName}
                          {ord.customerNote ? ` · Note: “${ord.customerNote}”` : ''}
                        </small>
                      </div>
                      <span className={`status-chip ${ord.status === 'completed' ? 'done' : ''}`}>
                        {ord.status}
                      </span>
                    </div>

                    {ord.status !== 'completed' && ord.status !== 'cancelled' && (
                      <div className="mini-btns">
                        {ord.status === 'placed' && (
                          <button
                            type="button"
                            className="mini-btn fill"
                            onClick={() => handleStatus(ord.id, 'accepted')}
                          >
                            Accept order
                          </button>
                        )}
                        {(ord.status === 'placed' || ord.status === 'accepted') && (
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() => handleStatus(ord.id, 'ready')}
                          >
                            Mark ready
                          </button>
                        )}
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={() => handleStatus(ord.id, 'completed')}
                        >
                          Complete ✓
                        </button>
                      </div>
                    )}

                    {ord.messages.length > 0 && (
                      <div
                        style={{
                          background: '#FFF6EE',
                          borderRadius: 12,
                          padding: '8px 10px',
                          fontSize: 14,
                          display: 'grid',
                          gap: 4,
                        }}
                      >
                        {ord.messages.slice(-2).map((m) => (
                          <div key={m.id}>
                            <b>{m.sender === 'kaarigar' ? 'You' : ord.customerName}:</b> {m.body}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="addr">
                      <input
                        type="text"
                        placeholder={`Reply to ${ord.customerName}...`}
                        value={replyByOrder[ord.id] ?? ''}
                        onChange={(ev) =>
                          setReplyByOrder((prev) => ({ ...prev, [ord.id]: ev.target.value }))
                        }
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') handleReply(ord.id);
                        }}
                      />
                      <button
                        type="button"
                        className="mini-btn fill"
                        onClick={() => handleReply(ord.id)}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};
