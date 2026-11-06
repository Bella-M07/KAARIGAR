import React, { useState } from 'react';
import { geocodeArea, onboardKaarigar, reverseGeocode } from '../lib/api';
import { PinPickerMap } from './LiveMap';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import type { GeoCenter, Kaarigar } from '../types';

interface OnboardModalProps {
  open: boolean;
  defaultCenter: GeoCenter;
  onClose: () => void;
  onCreated: (created: Kaarigar) => void;
  onOpenDashboard: () => void;
}

const EMOJIS = ['🍱', '👕', '🧵', '🫙', '🧁', '🌿', '🍬', '🪡', '🏺'];
const COLORS = ['#FBD3E3', '#B3E1E6', '#FFE2A8', '#FDE08A'];

function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const maxDim = 900;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error('Canvas unavailable'));
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.84));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Invalid image'));
    };
    img.src = url;
  });
}

export const OnboardModal: React.FC<OnboardModalProps> = ({
  open,
  defaultCenter,
  onClose,
  onCreated,
  onOpenDashboard,
}) => {
  const [step, setStep] = useState(0);
  const [bizName, setBizName] = useState('');
  const [emoji, setEmoji] = useState('🍱');
  const [idVerified, setIdVerified] = useState(true);

  const [svcTitle, setSvcTitle] = useState('');
  const [svcPrice, setSvcPrice] = useState('80');
  const [services, setServices] = useState<Array<{ title: string; priceInr: number }>>([]);

  const [areaInput, setAreaInput] = useState(defaultCenter.label || 'Navrangpura, Ahmedabad');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: defaultCenter.lat,
    lng: defaultCenter.lng,
  });
  const [serviceRadiusKm, setServiceRadiusKm] = useState(5);
  const [openTime, setOpenTime] = useState('09:00');
  const [closeTime, setCloseTime] = useState('20:00');
  const [dailyCap, setDailyCap] = useState(15);

  const [photos, setPhotos] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [createdKaarigar, setCreatedKaarigar] = useState<Kaarigar | null>(null);

  if (!open) return null;

  const addService = () => {
    const clean = svcTitle.trim();
    const price = Math.max(10, Number(svcPrice) || 80);
    if (
      clean &&
      services.length < 15 &&
      !services.some((s) => s.title.toLowerCase() === clean.toLowerCase())
    ) {
      setServices((prev) => [...prev, { title: clean, priceInr: price }]);
      setSvcTitle('');
    }
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        setCoords({ lat, lng });
        const rev = await reverseGeocode(lat, lng);
        setAreaInput(rev.label);
        setErr('');
      },
      () => setErr('Location permission denied — search or tap the map below.')
    );
  };

  const handlePhotosChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    let msg = '';
    const next = [...photos];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      if (f.size > 8_000_000) {
        msg = 'Skipped a photo over 8 MB.';
        continue;
      }
      if (next.length >= 8) {
        msg = 'Maximum 8 photos.';
        break;
      }
      try {
        const dataUrl = await compressImageToDataUrl(f);
        next.push(dataUrl);
      } catch {
        // ignore
      }
    }
    e.target.value = '';
    setPhotos(next);
    setErr(msg);
  };

  const handleNext = async () => {
    setErr('');
    if (step === 0) {
      if (!bizName.trim()) {
        setErr('Give your business a name to continue.');
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      let currentServices = services;
      if (svcTitle.trim()) {
        const clean = svcTitle.trim();
        const price = Math.max(10, Number(svcPrice) || 80);
        currentServices = [...services, { title: clean, priceInr: price }];
        setServices(currentServices);
        setSvcTitle('');
      }
      if (currentServices.length === 0) {
        setErr('Add at least one service with its price.');
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!areaInput.trim()) {
        setErr('Select your neighbourhood or society on the map.');
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      if (photos.length === 0) {
        setErr('Add at least one photo of your work.');
        return;
      }
      setSaving(true);
      try {
        const created = await onboardKaarigar({
          businessName: bizName.trim(),
          emoji,
          themeColor: COLORS[Math.floor(Math.random() * COLORS.length)],
          areaName: areaInput.trim(),
          lat: coords.lat,
          lng: coords.lng,
          serviceRadiusKm,
          openTime,
          closeTime,
          dailyCap,
          idVerified,
          services,
          photos,
        });
        setCreatedKaarigar(created);
        onCreated(created);
        setStep(4);
      } catch (e: any) {
        setErr(e.message ?? 'Could not save profile');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (step === 4) {
      onClose();
    }
  };

  return (
    <div
      className="ov on"
      role="dialog"
      aria-modal="true"
      aria-labelledby="st"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <div className="sheet-top">
          <div className="dots" style={{ flex: 1 }}>
            {[0, 1, 2, 3].map((idx) => (
              <i key={idx} className={idx <= Math.min(step, 3) ? 'on' : ''} />
            ))}
          </div>
          <button className="x" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {step === 0 && (
          <div>
            <h3 id="st">What is your business called?</h3>
            <p style={{ marginBottom: 12 }}>This is the name neighbours will see on the map.</p>
            <label style={{ marginBottom: 12 }}>
              Business name
              <input
                type="text"
                maxLength={60}
                placeholder="Meena's Kitchen"
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                autoFocus
              />
            </label>
            <label style={{ marginBottom: 12 }}>
              Pick a craft icon
              <div className="emoji-row">
                {EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className={`emoji-btn ${emoji === em ? 'on' : ''}`}
                    onClick={() => setEmoji(em)}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </label>
            <label className="op">
              <input
                type="checkbox"
                checked={idVerified}
                onChange={(e) => setIdVerified(e.target.checked)}
              />
              <span>Verify Govt ID (Aadhaar / Voter ID) for Trust Badge</span>
            </label>
          </div>
        )}

        {step === 1 && (
          <div>
            <h3>Services & prices</h3>
            <p style={{ marginBottom: 10 }}>
              List what you make or do with your price in ₹. Add up to 15 items.
            </p>
            <div className="addr" style={{ marginBottom: 10 }}>
              <input
                type="text"
                maxLength={45}
                aria-label="Service"
                placeholder="e.g. Gujarati thali tiffin"
                value={svcTitle}
                onChange={(e) => setSvcTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addService();
                  }
                }}
              />
              <input
                type="number"
                min={10}
                max={9999}
                style={{ maxWidth: 96 }}
                aria-label="Price in INR"
                placeholder="₹80"
                value={svcPrice}
                onChange={(e) => setSvcPrice(e.target.value)}
              />
              <button className="btn alt" type="button" onClick={addService}>
                Add
              </button>
            </div>
            <div className="sv">
              {services.map((s, idx) => (
                <span key={idx}>
                  {s.title} · ₹{s.priceInr}
                  <button
                    type="button"
                    aria-label={`Remove ${s.title}`}
                    onClick={() => setServices((prev) => prev.filter((_, j) => j !== idx))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'grid', gap: 10 }}>
            <h3>Pin your home, radius & hours</h3>
            <div className="addr">
              <PlaceAutocomplete
                value={areaInput}
                onChange={setAreaInput}
                onSelectPlace={(p) => {
                  setCoords({ lat: p.lat, lng: p.lng });
                  setAreaInput(p.label);
                }}
                onSubmit={async () => {
                  const g = await geocodeArea(areaInput);
                  if (g) {
                    setCoords({ lat: g.lat, lng: g.lng });
                    setAreaInput(g.label);
                  }
                }}
                placeholder="Search society or street in Ahmedabad..."
              />
              <button className="mini-btn" type="button" onClick={handleUseGps}>
                🎯 GPS
              </button>
            </div>

            <PinPickerMap
              lat={coords.lat}
              lng={coords.lng}
              onChangePin={(lat, lng, label) => {
                setCoords({ lat, lng });
                setAreaInput(label);
              }}
            />

            <div className="row-2">
              <label>
                Service radius
                <select
                  value={serviceRadiusKm}
                  onChange={(e) => setServiceRadiusKm(Number(e.target.value))}
                >
                  <option value={2}>Within 2 km</option>
                  <option value={5}>Within 5 km</option>
                  <option value={8}>Within 8 km</option>
                  <option value={10}>Within 10 km</option>
                </select>
              </label>
              <label>
                Daily order limit
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={dailyCap}
                  onChange={(e) => setDailyCap(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="row-2">
              <label>
                Opens at
                <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
              </label>
              <label>
                Closes at
                <input
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                />
              </label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'grid', gap: 12 }}>
            <h3>Show your work</h3>
            <p>Add 1 to 8 clear photos. Neighbours order from what they see.</p>
            <label className="drop">
              Tap to add photos
              <input type="file" accept="image/*" multiple onChange={handlePhotosChange} />
            </label>
            <div className="ph">
              {photos.map((url, idx) => (
                <div key={idx}>
                  <img src={url} alt={`Your work, photo ${idx + 1}`} />
                  <button
                    type="button"
                    aria-label={`Remove photo ${idx + 1}`}
                    onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== idx))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && createdKaarigar && (
          <div style={{ display: 'grid', gap: 12 }}>
            <h3>Welcome, {createdKaarigar.businessName}!</h3>
            <p>
              Your masked zone is now live on the map ({createdKaarigar.areaName}) with a{' '}
              <b>{createdKaarigar.trustScore}% Trust Score</b>.
            </p>
            <button
              className="btn"
              type="button"
              onClick={() => {
                onClose();
                onOpenDashboard();
              }}
            >
              Open My Shop Dashboard
            </button>
          </div>
        )}

        <div className="err" role="alert">
          {err}
        </div>

        <div className="nav2">
          <button
            className="btn ghost"
            type="button"
            style={{ visibility: step > 0 && step < 4 ? 'visible' : 'hidden' }}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </button>
          <button className="btn alt" type="button" disabled={saving} onClick={handleNext}>
            {saving ? 'Publishing…' : step === 3 ? 'Finish' : step === 4 ? 'View on map' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};
