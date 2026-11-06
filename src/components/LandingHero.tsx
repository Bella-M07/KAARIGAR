import React from 'react';
import type { PlaceSuggestion } from '../types';
import { PlaceAutocomplete } from './PlaceAutocomplete';

interface LandingHeroProps {
  heroInput: string;
  onChangeHeroInput: (val: string) => void;
  onSelectPlace: (place: PlaceSuggestion, svcPrefix?: string) => void;
  onSubmitSearch: () => void;
}

const DiamondFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg viewBox="0 0 120 120" aria-hidden="true">
    <rect
      x="20"
      y="20"
      width="80"
      height="80"
      rx="20"
      transform="rotate(45 60 60)"
      fill="#F8F0FF"
      fillOpacity=".9"
      stroke="#CDB4F0"
      strokeWidth="1.6"
      strokeDasharray="4 4"
    />
    <g fill="#C9A6F2">
      <circle cx="60" cy="13" r="2.4" />
      <circle cx="56" cy="17" r="2" />
      <circle cx="64" cy="17" r="2" />
      <circle cx="60" cy="21" r="2" />
      <circle cx="60" cy="107" r="2.4" />
      <circle cx="56" cy="103" r="2" />
      <circle cx="64" cy="103" r="2" />
      <circle cx="60" cy="99" r="2" />
    </g>
    <g className="lp-ln" transform="translate(28 29) scale(1.05)">
      {children}
    </g>
  </svg>
);

export const LandingHero: React.FC<LandingHeroProps> = ({
  heroInput,
  onChangeHeroInput,
  onSelectPlace,
  onSubmitSearch,
}) => {
  return (
    <header className="lp-hero" id="top">
      <div className="lp-bg" aria-hidden="true" />

      <div className="lp-in">
        <img className="lp-logo" src="/kaarigar-logo.png" alt="Kaarigar" />
        <p className="lp-lead">
          Tiffin, laundry, tailoring and more, made by women in your neighbourhood.
          <b>Find the nearest kaarigar in minutes.</b>
        </p>
        <div className="lp-search">
          <PlaceAutocomplete
            value={heroInput}
            onChange={onChangeHeroInput}
            allowNearSyntax
            ariaLabel="Search service or area"
            placeholder="Tiffin near me"
            onSelectPlace={onSelectPlace}
            onSubmit={onSubmitSearch}
          />
          <button type="button" className="lp-btn" onClick={onSubmitSearch}>
            Find nearby
          </button>
        </div>
      </div>

      <div className="lp-tiles" aria-hidden="true">
        {/* 1. Tailoring / Sewing Machine */}
        <div
          className="lp-t"
          style={{ left: '7%', top: '14%', animationDelay: '0s', animationDuration: '7s' }}
        >
          <DiamondFrame>
            <rect x="4" y="46" width="52" height="6" rx="3" fill="#F8B8CF" />
            <path
              d="M10 46V22Q10 14 18 14H44Q52 14 52 21V28H45V46Z"
              fill="#F4A3C2"
            />
            <rect x="21" y="3" width="9" height="9" rx="2" fill="#D9C2F5" />
            <path className="lp-dash" d="M26 12Q28 22 48 24" fill="none" strokeWidth="1.8" />
            <g className="lp-nd">
              <path d="M48 28V42" />
            </g>
            <circle cx="14" cy="27" r="7" fill="#FFF1C9" />
            <g className="lp-spin">
              <path d="M14 23V31M10 27H18" strokeWidth="2" />
            </g>
          </DiamondFrame>
        </div>

        {/* 2. Tiffin Dabba */}
        <div
          className="lp-t"
          style={{ left: '1.5%', top: '44%', animationDelay: '-2s', animationDuration: '8s' }}
        >
          <DiamondFrame>
            <g className="lp-lid">
              <path d="M18 14Q30 -3 42 14" fill="none" />
              <rect x="13" y="13" width="34" height="7" rx="3.5" fill="#F4A3C2" />
            </g>
            <rect x="14" y="22" width="32" height="11" rx="3" fill="#FFF1C9" />
            <rect x="14" y="34" width="32" height="11" rx="3" fill="#FAD4A8" />
            <rect x="14" y="46" width="32" height="11" rx="3" fill="#D9C2F5" />
            <path d="M19 27.5h8M19 39.5h8M19 51.5h8" strokeWidth="2" />
          </DiamondFrame>
        </div>

        {/* 3. Laundry Basket */}
        <div
          className="lp-t"
          style={{ left: '10%', top: '70%', animationDelay: '-4s', animationDuration: '7.5s' }}
        >
          <DiamondFrame>
            <g className="lp-bump">
              <path d="M12 28Q14 14 26 19Q32 8 42 19Q52 18 49 29Z" fill="#FFF1C9" />
              <path d="M20 28Q30 16 40 28Z" fill="#D9C2F5" />
            </g>
            <path d="M6 28H54L48 54Q47.5 56 45 56H15Q12.5 56 12 54Z" fill="#FAD4A8" />
            <path d="M9 39H51M12 48H48M22 29L24 55M38 29L36 55" strokeWidth="1.8" />
            <circle className="lp-bb lp-b1" cx="44" cy="22" r="3" fill="#fff" strokeWidth="1.8" />
            <circle className="lp-bb lp-b2" cx="50" cy="18" r="2.2" fill="#fff" strokeWidth="1.6" />
            <circle className="lp-bb lp-b3" cx="38" cy="16" r="2.6" fill="#fff" strokeWidth="1.6" />
          </DiamondFrame>
        </div>

        {/* 4. Hyperlocal Map Pin */}
        <div
          className="lp-t"
          style={{ right: '8%', top: '15%', animationDelay: '-1s', animationDuration: '8s' }}
        >
          <DiamondFrame>
            <path d="M5 56L16 46H44L55 56Z" fill="#FFF1C9" />
            <g className="lp-hop">
              <path
                d="M30 48C17 35 15 30 15 24A15 15 0 0 1 45 24C45 30 43 35 30 48Z"
                fill="#F4A3C2"
              />
              <circle cx="30" cy="24" r="6" fill="#FFF1C9" />
            </g>
          </DiamondFrame>
        </div>

        {/* 5. Floral / Craft / Mehndi */}
        <div
          className="lp-t"
          style={{ right: '2.5%', top: '45%', animationDelay: '-3s', animationDuration: '7s' }}
        >
          <DiamondFrame>
            <g className="lp-sway">
              <path d="M30 56V30M14 56V41M46 56V41" fill="none" />
              <path
                d="M30 56Q17 54 15 46Q26 46 30 56ZM30 56Q43 54 45 46Q34 46 30 56Z"
                fill="#C5E3C0"
              />
              <path d="M22 22Q22 35 30 36Q38 35 38 22L34 26L30 17L26 26Z" fill="#F4A3C2" />
              <path d="M7 30Q7 41 14 42Q21 41 21 30L17.5 33L14 26L10.5 33Z" fill="#F8B8CF" />
              <path d="M39 30Q39 41 46 42Q53 41 53 30L49.5 33L46 26L42.5 33Z" fill="#F8B8CF" />
            </g>
          </DiamondFrame>
        </div>

        {/* 6. Home Baking Cake */}
        <div
          className="lp-t"
          style={{ right: '11%', top: '71%', animationDelay: '-5s', animationDuration: '8.5s' }}
        >
          <DiamondFrame>
            <ellipse cx="30" cy="53" rx="24" ry="4.5" fill="#F7EEFF" />
            <path d="M10 34H50V48Q50 52 46 52H14Q10 52 10 48Z" fill="#F8B8CF" />
            <rect x="16" y="22" width="28" height="12" rx="3" fill="#FFF1C9" />
            <path d="M10 34q4 6 8 0t8 0t8 0t8 0t8 0" fill="none" />
            <rect x="28" y="12" width="4" height="10" rx="1.5" fill="#D9C2F5" />
            <path className="lp-flame" d="M30 3Q35 8 30 12Q25 8 30 3Z" fill="#FFC857" />
          </DiamondFrame>
        </div>
      </div>
    </header>
  );
};
