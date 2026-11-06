import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { CustomerOrdersModal } from './components/CustomerOrdersModal';
import {
  BanglesSvg,
  ButterflySvg,
  HoopSvg,
  LotusSvg,
  MachineSvg,
  PeacockSvg,
  PotSvg,
  RoseSvg,
  StrawSvg,
  SunSvg,
  SweetsSvg,
  TiffinSvg,
} from './components/Illustrations';
import { LiveMap } from './components/LiveMap';
import { nearLabel, OrderModal } from './components/OrderModal';
import { OnboardModal } from './components/OnboardModal';
import { PlaceAutocomplete } from './components/PlaceAutocomplete';
import { ProviderDashboardModal } from './components/ProviderDashboardModal';
import {
  fetchCurrentUser,
  fetchNearbyKaarigars,
  geocodeArea,
  logoutUser,
  registerUser,
  reverseGeocode,
} from './lib/api';
import type { AuthUser, GeoCenter, Kaarigar } from './types';

const CATEGORIES: Array<{
  title: string;
  subtitle: string;
  Icon: React.FC;
  gridClass: string;
}> = [
  { title: 'Tiffin', subtitle: 'Daily home meals', Icon: TiffinSvg, gridClass: 'g1 ar' },
  { title: 'Mehndi', subtitle: 'For every occasion', Icon: PeacockSvg, gridClass: 'g2' },
  { title: 'Laundry', subtitle: 'Wash, iron, fold', Icon: LotusSvg, gridClass: 'g5' },
  { title: 'Tailoring', subtitle: 'Stitching and fixes', Icon: MachineSvg, gridClass: 'g4 ar' },
  { title: 'Papad & pickle', subtitle: 'Small batches', Icon: SunSvg, gridClass: 'g6' },
  { title: 'Baking', subtitle: 'Cakes and snacks', Icon: StrawSvg, gridClass: 'g7' },
];

const AHMEDABAD_AREAS: Array<{ name: string; lat: number; lng: number; label: string }> = [
  { name: 'Navrangpura / LDCE', lat: 23.0338, lng: 72.5466, label: 'Navrangpura (LDCE), Ahmedabad' },
  { name: 'Paldi', lat: 23.0145, lng: 72.5603, label: 'Paldi, Ahmedabad' },
  { name: 'Satellite', lat: 23.0274, lng: 72.5174, label: 'Satellite, Ahmedabad' },
  { name: 'Vastrapur', lat: 23.0396, lng: 72.5286, label: 'Vastrapur, Ahmedabad' },
  { name: 'Bodakdev', lat: 23.0402, lng: 72.5067, label: 'Bodakdev, Ahmedabad' },
  { name: 'Maninagar', lat: 22.9968, lng: 72.6022, label: 'Maninagar, Ahmedabad' },
];

const MARQUEE_WORDS = ['Tiffin', 'Laundry', 'Tailoring', 'Papad', 'Pickle', 'Mehndi', 'Baking'];

export const App: React.FC = () => {
  const heroRef = useRef<HTMLElement | null>(null);
  const findRef = useRef<HTMLElement | null>(null);

  // Authenticated user session
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authPrompt, setAuthPrompt] = useState('');

  // Search & Map state
  const [heroInput, setHeroInput] = useState('');
  const [areaSearchInput, setAreaSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [sortBy, setSortBy] = useState<'d' | 'r' | 'p'>('d');
  const [center, setCenter] = useState<GeoCenter>({
    lat: 23.0338,
    lng: 72.5466,
    label: 'Navrangpura (LDCE), Ahmedabad',
  });
  const [locatingGps, setLocatingGps] = useState(false);

  const [kaarigars, setKaarigars] = useState<Kaarigar[]>([]);
  const [fiveKmKaarigars, setFiveKmKaarigars] = useState<Kaarigar[]>([]);
  const [activeModalKaarigar, setActiveModalKaarigar] = useState<Kaarigar | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  // Bottom #join Kaarigar registration form
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPin, setRegPin] = useState('');
  const [regStatus, setRegStatus] = useState('');
  const [onboardOpen, setOnboardOpen] = useState(false);

  // Role-specific modals (strictly bound to currentUser)
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [myOrdersOpen, setMyOrdersOpen] = useState(false);

  const [tilesVisible, setTilesVisible] = useState(false);

  // Restore session on page load
  const refreshSession = useCallback(async () => {
    const user = await fetchCurrentUser();
    setCurrentUser(user);
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const loadKaarigars = useCallback(async () => {
    try {
      const [filtered, within5] = await Promise.all([
        fetchNearbyKaarigars({
          lat: center.lat,
          lng: center.lng,
          radiusKm,
          query: searchQuery,
          sort: sortBy,
        }),
        fetchNearbyKaarigars({
          lat: center.lat,
          lng: center.lng,
          radiusKm: 5,
          query: '',
          sort: 'd',
        }),
      ]);
      setKaarigars(filtered);
      setFiveKmKaarigars(within5);
    } catch {
      // ignore transient boot error
    }
  }, [center.lat, center.lng, radiusKm, searchQuery, sortBy]);

  useEffect(() => {
    loadKaarigars();
  }, [loadKaarigars]);

  useEffect(() => {
    const patchSection = document.getElementById('patch');
    if (!patchSection) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setTilesVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    io.observe(patchSection);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveModalKaarigar(null);
        setOnboardOpen(false);
        setDashboardOpen(false);
        setMyOrdersOpen(false);
        setAuthModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const categoryCount = useCallback(
    (term: string) => {
      const lower = term.toLowerCase();
      return fiveKmKaarigars.filter((k) => {
        const hay = `${k.businessName} ${k.services.map((s) => s.title).join(' ')}`.toLowerCase();
        return hay.includes(lower);
      }).length;
    },
    [fiveKmKaarigars]
  );

  const handleHeroSearch = async () => {
    const raw = heroInput.trim();
    const nearMatch = raw.match(/^(.*?)\s+(?:near|in|around)\s+(.+)$/i);
    if (nearMatch) {
      const svcPart = nearMatch[1].trim();
      const areaPart = nearMatch[2].trim();
      setSearchQuery(svcPart);
      const geo = await geocodeArea(areaPart);
      if (geo) setCenter(geo);
    } else if (raw) {
      const looksLikeService = /tiffin|thali|mehndi|laundry|wash|iron|stitch|tailor|blouse|papad|pickle|cake|bak|ladoo|mithai|potli|craft|matka|diya/i.test(
        raw
      );
      if (!looksLikeService) {
        const geo = await geocodeArea(raw);
        if (geo) {
          setCenter(geo);
          setSearchQuery('');
        } else {
          setSearchQuery(raw);
        }
      } else {
        setSearchQuery(raw);
      }
    }
    findRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleUseBrowserGps = () => {
    if (!navigator.geolocation) return;
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        const rev = await reverseGeocode(lat, lng);
        setCenter({ lat, lng, label: rev.label });
        setLocatingGps(false);
      },
      () => {
        setLocatingGps(false);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const handleSelectTile = (categoryTitle: string) => {
    const term = categoryTitle.split(' ')[0];
    setSearchQuery(term);
    findRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Bottom "Become a kaarigar" registration card creates a real PIN-secured Kaarigar account
  const handleStartRegister = async () => {
    if (currentUser) {
      if (currentUser.kaarigarId) {
        setDashboardOpen(true);
      } else {
        setOnboardOpen(true);
      }
      return;
    }

    const cleanName = regName.trim();
    const digits = regPhone.replace(/\D/g, '');
    const cleanPin = regPin.trim();
    if (!cleanName) {
      setRegStatus('Enter your name to continue.');
      return;
    }
    if (digits.length !== 10) {
      setRegStatus('Enter a 10-digit mobile number.');
      return;
    }
    if (cleanPin.length < 4) {
      setRegStatus('Set a 4 to 6 digit PIN so only you can access your shop.');
      return;
    }

    try {
      const user = await registerUser({
        name: cleanName,
        phone: digits,
        pin: cleanPin,
        role: 'kaarigar',
      });
      setCurrentUser(user);
      setRegStatus(`Account created for ${cleanName.split(' ')[0]}! Complete your shop details.`);
      setOnboardOpen(true);
    } catch (e: any) {
      setRegStatus(e.message ?? 'Could not register');
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    setDashboardOpen(false);
    setMyOrdersOpen(false);
  };

  const marqueeItems = useMemo(() => {
    const trip = [...MARQUEE_WORDS, ...MARQUEE_WORDS, ...MARQUEE_WORDS];
    return [...trip, ...trip];
  }, []);

  const lowestPrice = (k: Kaarigar) =>
    k.services.length ? Math.min(...k.services.map((s) => s.priceInr)) : 0;

  return (
    <>
      <nav>
        <div className="wrap">
          <a className="logo" href="#top">
            Kaarigar
          </a>
          <div className="links">
            <a href="#patch">Services</a>
            <a href="#find">Find nearby</a>

            {currentUser ? (
              <>
                {currentUser.role === 'kaarigar' ? (
                  <button
                    type="button"
                    className="nav-link"
                    onClick={() => {
                      if (currentUser.kaarigarId) setDashboardOpen(true);
                      else setOnboardOpen(true);
                    }}
                  >
                    {currentUser.kaarigarId ? 'My shop dashboard' : 'Set up my shop'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="nav-link"
                    onClick={() => setMyOrdersOpen(true)}
                  >
                    My orders
                  </button>
                )}
                <button type="button" className="btn alt" onClick={handleLogout}>
                  {currentUser.name.split(' ')[0]} · Log out
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="nav-link"
                  onClick={() => {
                    setAuthPrompt('');
                    setAuthModalOpen(true);
                  }}
                >
                  Log in
                </button>
                <a className="btn" href="#join">
                  Become a kaarigar
                </a>
              </>
            )}
          </div>
        </div>
      </nav>

      <header
        className="hero"
        id="top"
        ref={heroRef}
        onMouseMove={(e) => {
          const el = heroRef.current;
          if (!el) return;
          const r = el.getBoundingClientRect();
          el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width - 0.5) * 60}px`);
          el.style.setProperty('--my', `${((e.clientY - r.top) / r.height - 0.5) * 60}px`);
        }}
      >
        <div
          className="fl"
          style={{ ['--d' as any]: 0.6, left: -50, top: -40, width: 250 }}
        >
          <SunSvg />
        </div>
        <div
          className="fl"
          style={{ ['--d' as any]: -0.5, right: -10, top: 10, width: 150, animationDelay: '-2s' }}
        >
          <RoseSvg />
        </div>
        <div
          className="fl"
          style={{ ['--d' as any]: 0.4, left: '3%', bottom: -6, width: 150, animationDelay: '-1s' }}
        >
          <StrawSvg />
        </div>
        <div
          className="fl"
          style={{ ['--d' as any]: -0.7, right: '2%', bottom: -10, width: 140, animationDelay: '-3s' }}
        >
          <StrawSvg />
        </div>
        <div className="bfly">
          <ButterflySvg a="#8FA8F0" b="#F5A21A" />
        </div>
        <div className="bfly" style={{ animationDelay: '-8s', width: 52 }}>
          <ButterflySvg a="#F5A21A" b="#D63F9B" />
        </div>

        <div className="badge">
          <h1>Ghar ka hunar, aapke mohalle mein.</h1>
          <p>
            Tiffin, laundry, papad, tailoring and more, made by women in your neighbourhood. Find
            the nearest kaarigar and order in minutes.
          </p>
          <div className="search" style={{ overflow: 'visible' }}>
            <PlaceAutocomplete
              value={heroInput}
              onChange={setHeroInput}
              allowNearSyntax
              ariaLabel="Search service or area"
              placeholder="Tiffin near Shyamal, Ahmedabad"
              onSelectPlace={(place, svcPrefix) => {
                setCenter({ lat: place.lat, lng: place.lng, label: place.label });
                if (svcPrefix) setSearchQuery(svcPrefix);
                setHeroInput(svcPrefix ? `${svcPrefix} near ${place.label}` : place.label);
                findRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              onSubmit={handleHeroSearch}
            />
            <button type="button" className="btn alt" onClick={handleHeroSearch}>
              Search
            </button>
          </div>
        </div>
      </header>

      <div className="mq" aria-hidden="true">
        <div>
          {marqueeItems.map((w, idx) => (
            <React.Fragment key={idx}>
              <span>{w}</span>
              <i>✦</i>
            </React.Fragment>
          ))}
        </div>
      </div>

      <section id="patch">
        <div className="wrap">
          <h2>What would you like today?</h2>
          <p className="sub">Tap a tile to see who makes it near you.</p>
          <div className="patch">
            {CATEGORIES.map((cat, idx) => {
              const term = cat.title.split(' ')[0];
              return (
                <button
                  key={cat.title}
                  type="button"
                  className={`tile ${cat.gridClass} ${tilesVisible ? 'in' : ''}`}
                  style={{ transitionDelay: `${idx * 90}ms` }}
                  onClick={() => handleSelectTile(cat.title)}
                >
                  <div className="fr">
                    <cat.Icon />
                  </div>
                  <div className="lab">
                    {cat.title}
                    <small>{categoryCount(term)} near you</small>
                  </div>
                </button>
              );
            })}

            <div className="deco g3">
              <div className="m">
                <RoseSvg />
              </div>
              <div className="m">
                <LotusSvg />
              </div>
              <div className="m">
                <StrawSvg />
              </div>
            </div>
            <div className="deco g8">
              <RoseSvg />
              <div className="bfly2">
                <ButterflySvg a="#8FA8F0" b="#fff" />
              </div>
            </div>
            <div className="deco g9">
              <SweetsSvg />
            </div>
            <div className="deco g10">
              <HoopSvg />
            </div>
            <div className="deco g11">
              <PotSvg />
            </div>
            <div className="deco g12">
              <BanglesSvg />
            </div>
          </div>
        </div>
      </section>

      <section id="find" ref={findRef} style={{ paddingTop: 20 }}>
        <div className="wrap">
          <h2>Kaarigars near you</h2>
          <p className="sub">Circles show the general area only. Exact addresses are never shown.</p>

          <div className="bar">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter service: tiffin, mehndi, ladoo..."
              aria-label="Search services"
            />
            <PlaceAutocomplete
              value={areaSearchInput}
              onChange={setAreaSearchInput}
              placeholder="📍 Pin society / street (e.g. Law Garden, Bopal)..."
              ariaLabel="Change map location"
              onSelectPlace={(place) => {
                setCenter({ lat: place.lat, lng: place.lng, label: place.label });
                setAreaSearchInput(place.label);
              }}
              onSubmit={async () => {
                if (!areaSearchInput.trim()) return;
                const g = await geocodeArea(areaSearchInput);
                if (g) {
                  setCenter(g);
                  setAreaSearchInput(g.label);
                }
              }}
            />
            <select
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              aria-label="Distance"
            >
              <option value={1}>Within 1 km</option>
              <option value={2}>Within 2 km</option>
              <option value={5}>Within 5 km</option>
              <option value={10}>Within 10 km</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'd' | 'r' | 'p')}
              aria-label="Sort"
            >
              <option value="d">Nearest</option>
              <option value="r">Top rated</option>
              <option value="p">Lowest price</option>
            </select>
          </div>

          <div className="chips" role="group" aria-label="Quick Ahmedabad neighbourhoods">
            {AHMEDABAD_AREAS.map((area) => {
              const active =
                Math.abs(center.lat - area.lat) < 0.004 && Math.abs(center.lng - area.lng) < 0.004;
              return (
                <button
                  key={area.name}
                  type="button"
                  className="chip"
                  aria-pressed={active}
                  onClick={() => {
                    setCenter({ lat: area.lat, lng: area.lng, label: area.label });
                    setAreaSearchInput('');
                  }}
                >
                  {area.name}
                </button>
              );
            })}
            {searchQuery && (
              <button
                type="button"
                className="chip"
                onClick={() => setSearchQuery('')}
                title="Clear service filter"
              >
                ✕ “{searchQuery}”
              </button>
            )}
          </div>

          <div className="find">
            <LiveMap
              center={center}
              radiusKm={radiusKm}
              kaarigars={kaarigars}
              selectedId={selectedPinId}
              onSelectKaarigar={(k) => {
                setSelectedPinId(k.id);
                setActiveModalKaarigar(k);
              }}
              onMoveUserCenter={(lat, lng, label) => setCenter({ lat, lng, label })}
              onUseBrowserGps={handleUseBrowserGps}
              locatingGps={locatingGps}
            />

            <div className="list">
              {kaarigars.length > 0 ? (
                kaarigars.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    className={`k ${k.id === selectedPinId ? 'on' : ''}`}
                    onClick={() => {
                      setSelectedPinId(k.id);
                      setActiveModalKaarigar(k);
                    }}
                  >
                    <div className="av" style={{ background: k.themeColor }}>
                      {k.photos[0] ? <img src={k.photos[0]} alt={k.businessName} /> : k.emoji}
                    </div>
                    <div>
                      <b>{k.businessName}</b>
                      <small>
                        {k.services
                          .slice(0, 2)
                          .map((s) => s.title)
                          .join(' · ')}
                        {k.services.length > 2 ? ` +${k.services.length - 2}` : ''}
                      </small>
                      <small>
                        ★ {k.rating} ({k.reviewCount}) · {nearLabel(k.distanceKm)} · from ₹
                        {lowestPrice(k)} · 🛡️ {k.trustScore}%
                      </small>
                    </div>
                    <span className={`tag ${k.takingOrders ? '' : 'busy'}`}>
                      {k.takingOrders ? 'Taking orders' : 'Back tomorrow'}
                    </span>
                  </button>
                ))
              ) : (
                <div className="empty">
                  Nobody offering “{searchQuery || 'this service'}” within {radiusKm} km of{' '}
                  {center.label} yet.{' '}
                  <button type="button" className="chip" onClick={() => setRadiusKm(10)}>
                    Try 10 km
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="how">
        <div className="wrap">
          <h2>How it works</h2>
          <p className="sub">Three steps from craving to doorstep.</p>
          <div className="steps">
            <div className="step">
              <div className="ic">
                <LotusSvg />
              </div>
              <h3>Pick on the map</h3>
              <p>See who is open within 5 km, with photos, prices and reviews.</p>
            </div>
            <div className="step">
              <div className="ic">
                <TiffinSvg />
              </div>
              <h3>Order or subscribe</h3>
              <p>
                One-time, daily tiffin plan, pickup and drop, or a custom quote for big orders. Chat
                and call unlock once you buy.
              </p>
            </div>
            <div className="step">
              <div className="ic">
                <SunSvg />
              </div>
              <h3>Pay with UPI</h3>
              <p>Pay in the app or in cash. Your kaarigar is paid every week.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="join" id="join">
        <div className="wrap">
          <div>
            <h2>Your skill, your hours, your income.</h2>
            <ul className="perks">
              <li>Free to join. We keep 8 to 10% of each order.</li>
              <li>Set your daily limit and pause any time.</li>
              <li>Your address stays hidden until you confirm an order.</li>
              <li>Sign up in Hindi, Gujarati or English.</li>
            </ul>
          </div>
          <div className="card">
            {currentUser ? (
              <>
                <b style={{ fontFamily: 'Fraunces, serif', fontSize: 22 }}>
                  Namaste, {currentUser.name}!
                </b>
                <p style={{ margin: 0 }}>
                  {currentUser.kaarigarId
                    ? `Your shop (${currentUser.businessName}) is registered and protected by your PIN.`
                    : 'Your account is ready—set up your Kaarigar shop profile now.'}
                </p>
                <button
                  type="button"
                  className="btn alt"
                  onClick={() => {
                    if (currentUser.kaarigarId) setDashboardOpen(true);
                    else setOnboardOpen(true);
                  }}
                >
                  {currentUser.kaarigarId ? 'Open My Shop Dashboard' : 'Set up my shop'}
                </button>
              </>
            ) : (
              <>
                <label>
                  Your name
                  <input
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Meena Patel"
                  />
                </label>
                <label>
                  Mobile number
                  <input
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    inputMode="numeric"
                    placeholder="98765 43210"
                  />
                </label>
                <label>
                  Create a 4 to 6 digit PIN
                  <input
                    type="password"
                    value={regPin}
                    onChange={(e) => setRegPin(e.target.value)}
                    inputMode="numeric"
                    placeholder="••••"
                  />
                </label>
                <button type="button" className="btn alt" onClick={handleStartRegister}>
                  Register & set up shop
                </button>
                {regStatus && (
                  <div className="ok" role="status">
                    {regStatus}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">Kaarigar, made with respect for home hunar.</div>
      </footer>

      <AuthModal
        open={authModalOpen}
        promptMessage={authPrompt}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={(user, isNew) => {
          setCurrentUser(user);
          setAuthModalOpen(false);
          setAuthPrompt('');
          if (isNew && user.role === 'kaarigar' && !user.kaarigarId) {
            setOnboardOpen(true);
          }
        }}
      />

      <OrderModal
        kaarigar={activeModalKaarigar}
        currentUser={currentUser}
        onRequireLogin={() => {
          setAuthPrompt('Log in or create a neighbour account in 10 seconds to place your order.');
          setAuthModalOpen(true);
        }}
        onClose={() => setActiveModalKaarigar(null)}
        onRefreshKaarigars={loadKaarigars}
      />

      <OnboardModal
        open={onboardOpen}
        defaultCenter={center}
        onClose={() => setOnboardOpen(false)}
        onCreated={async (created) => {
          await refreshSession();
          setCenter({
            lat: created.maskedLat,
            lng: created.maskedLng,
            label: created.areaName,
          });
          setSelectedPinId(created.id);
          loadKaarigars();
        }}
        onOpenDashboard={() => setDashboardOpen(true)}
      />

      <ProviderDashboardModal
        open={dashboardOpen}
        onClose={() => setDashboardOpen(false)}
        onChanged={loadKaarigars}
        onNeedSetupShop={() => setOnboardOpen(true)}
      />

      <CustomerOrdersModal
        open={myOrdersOpen}
        onClose={() => setMyOrdersOpen(false)}
        onReviewSubmitted={loadKaarigars}
      />
    </>
  );
};
