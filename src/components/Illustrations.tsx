import React from 'react';

const P = '#D63F9B';
const T = '#1F6F6B';
const S = '#F5A21A';

export const SunSvg: React.FC = () => (
  <svg viewBox="0 0 100 100" className="mo">
    <g className="spin">
      {[...Array(12)].map((_, i) => (
        <path
          key={i}
          d="M50 3Q60 16 50 30Q40 16 50 3"
          fill={i % 2 ? '#F2A6CB' : S}
          transform={`rotate(${i * 30} 50 50)`}
        />
      ))}
    </g>
    <circle cx="50" cy="50" r="22" fill="#F58220" />
    <path d="M52 29A22 22 0 0 1 52 71A15 22 0 0 0 52 29" fill="#BCD0F5" />
    <circle cx="41" cy="46" r="3" fill="#3A1630" />
    <circle cx="36" cy="54" r="4" fill="#F28CB8" />
    <path d="M38 61Q43 64 47 61" stroke="#C2185B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
  </svg>
);

export const RoseSvg: React.FC = () => (
  <svg viewBox="0 0 100 100" className="mo">
    <path d="M50 62V98" stroke={T} strokeWidth="4" />
    <path d="M50 84Q30 80 28 68Q44 68 50 84" fill={T} />
    <g className="sway">
      <circle cx="50" cy="38" r="26" fill="#F48FC0" stroke={P} strokeWidth="2" />
      <path
        d="M44 38a6 6 0 1 1 12 0a12 12 0 1 1-20-4a18 18 0 1 1 28 10"
        fill="none"
        stroke={P}
        strokeWidth="2.5"
      />
      <g fill="#fff">
        <circle cx="30" cy="30" r="2" />
        <circle cx="70" cy="34" r="2" />
        <circle cx="38" cy="58" r="2" />
        <circle cx="62" cy="56" r="2" />
      </g>
    </g>
  </svg>
);

const BerryGroup: React.FC<{ x: number; y: number; s: number }> = ({ x, y, s }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0-14C14-14 16 4 0 18C-16 4-14-14 0-14Z" fill="#EF4A2B" />
    <path d="M-8-15L0-9L8-15L4-19L0-16L-4-19Z" fill={T} />
    <g fill="#FFE9A8">
      <circle cx="-5" cy="-3" r="1.4" />
      <circle cx="4" cy="0" r="1.4" />
      <circle cx="-2" cy="8" r="1.4" />
    </g>
  </g>
);

export const StrawSvg: React.FC = () => (
  <svg viewBox="0 0 100 100" className="mo">
    <g className="sway">
      <path d="M50 98C50 70 46 50 28 38M50 80C58 60 70 50 78 40" stroke={T} strokeWidth="3.5" fill="none" />
      <path d="M50 90Q28 90 22 78Q42 74 50 90M50 76Q72 76 80 64Q58 60 50 76" fill={T} />
      <BerryGroup x={26} y={36} s={0.9} />
      <BerryGroup x={78} y={38} s={0.8} />
      <BerryGroup x={52} y={56} s={0.95} />
      <circle cx="64" cy="22" r="5" fill="#fff" />
      <circle cx="64" cy="22" r="2" fill={S} />
    </g>
  </svg>
);

export const ButterflySvg: React.FC<{ a: string; b: string }> = ({ a, b }) => (
  <svg viewBox="0 0 60 50" className="mo">
    <path className="wl" d="M30 25C18 4 2 8 6 24C8 34 22 34 30 25Z" fill={a} />
    <path className="wr" d="M30 25C42 4 58 8 54 24C52 34 38 34 30 25Z" fill={a} />
    <path
      d="M30 14V38M30 14q-4-8-8-9M30 14q4-8 8-9"
      stroke="#2B2A6B"
      strokeWidth="2.5"
      fill="none"
      strokeLinecap="round"
    />
    <circle cx="15" cy="22" r="3" fill={b} />
    <circle cx="45" cy="22" r="3" fill={b} />
  </svg>
);

export const LotusSvg: React.FC = () => (
  <svg viewBox="0 0 100 100" className="mo">
    <g className="sway">
      {[-60, -30, 0, 30, 60].map((r) => (
        <path
          key={r}
          d="M50 80Q30 50 50 20Q70 50 50 80"
          fill="#F48FC0"
          stroke="#fff"
          strokeWidth="2"
          transform={`rotate(${r} 50 80)`}
        />
      ))}
    </g>
    <ellipse cx="50" cy="84" rx="38" ry="8" fill="#2F8F4E" />
  </svg>
);

export const PeacockSvg: React.FC = () => (
  <svg viewBox="0 0 100 100" className="mo">
    <g className="fan">
      {[-72, -54, -36, -18, 0, 18, 36, 54, 72].map((r) => (
        <g key={r} transform={`rotate(${r} 50 72)`}>
          <ellipse cx="50" cy="32" rx="8" ry="24" fill="#3C9D5A" />
          <ellipse cx="50" cy="20" rx="4.5" ry="7" fill="#1E5FB3" />
          <ellipse cx="50" cy="20" rx="1.8" ry="3" fill={S} />
        </g>
      ))}
    </g>
    <path d="M42 98Q40 70 50 62Q60 70 58 98Z" fill="#1E5FB3" />
    <circle cx="50" cy="58" r="6" fill="#1E5FB3" />
  </svg>
);

export const TiffinSvg: React.FC = () => (
  <svg viewBox="0 0 100 100" className="mo">
    <g className="bob">
      <path d="M30 28Q50-2 70 28" fill="none" stroke={P} strokeWidth="4" />
      <rect x="26" y="26" width="48" height="8" rx="4" fill={P} />
    </g>
    {[0, 1, 2, 3].map((i) => (
      <React.Fragment key={i}>
        <rect x="28" y={36 + i * 15} width="44" height="14" rx="4" fill="#FFF6EE" stroke={P} strokeWidth="2.5" />
        <circle cx={40 + (i % 2) * 8} cy={43 + i * 15} r="4" fill={i % 2 ? S : '#E8406E'} />
        <circle cx={60 - (i % 2) * 6} cy={43 + i * 15} r="3" fill={i % 2 ? '#E8406E' : S} />
      </React.Fragment>
    ))}
  </svg>
);

export const MachineSvg: React.FC = () => (
  <svg viewBox="0 0 100 100" className="mo">
    <rect x="8" y="58" width="84" height="7" rx="2" fill="#E58A3C" stroke="#3A1630" strokeWidth="2" />
    <path d="M20 65V92M80 65V92M20 80Q50 70 80 80" stroke="#3A1630" fill="none" strokeWidth="2.5" />
    <path d="M26 58V40Q26 30 38 30H66Q74 30 74 40V58Z" fill="#2b2230" />
    <rect x="30" y="20" width="4" height="12" fill="#2b2230" />
    <circle cx="74" cy="42" r="8" fill="#FFF6EE" stroke="#3A1630" strokeWidth="2" />
    <g className="spin2">
      <path d="M74 36V48M68 42H80" stroke="#3A1630" strokeWidth="2" />
    </g>
    <g className="nd">
      <path d="M36 52V62" stroke="#fff" strokeWidth="2" />
    </g>
    <circle cx="42" cy="26" r="4" fill={P} />
    <path d="M4 72H96" stroke="#3A1630" strokeWidth="2.5" strokeDasharray="5 5" className="thread" />
  </svg>
);

export const SweetsSvg: React.FC = () => (
  <svg viewBox="0 0 100 100" className="mo">
    <ellipse cx="50" cy="74" rx="42" ry="12" fill="#fff" stroke={P} strokeWidth="3" />
    <ellipse cx="50" cy="72" rx="32" ry="7" fill="#FBD3E3" />
    <g className="bob">
      <circle cx="34" cy="56" r="13" fill={S} />
      <circle cx="66" cy="56" r="13" fill={S} />
      <circle cx="50" cy="40" r="13" fill="#F58220" />
      <g fill="#FFE9A8">
        <circle cx="30" cy="52" r="1.8" />
        <circle cx="38" cy="60" r="1.8" />
        <circle cx="62" cy="52" r="1.8" />
        <circle cx="70" cy="60" r="1.8" />
        <circle cx="46" cy="36" r="1.8" />
        <circle cx="55" cy="44" r="1.8" />
      </g>
      <g fill={T}>
        <circle cx="34" cy="48" r="3" />
        <circle cx="66" cy="48" r="3" />
        <circle cx="50" cy="32" r="3" />
      </g>
    </g>
  </svg>
);

export const HoopSvg: React.FC = () => (
  <svg viewBox="0 0 100 100" className="mo">
    <circle cx="50" cy="50" r="38" fill="#FFF6EE" stroke="#B9783A" strokeWidth="7" />
    <rect x="44" y="6" width="12" height="9" rx="2" fill="#B9783A" />
    <g className="spin">
      {[0, 60, 120, 180, 240, 300].map((r) => (
        <ellipse key={r} cx="50" cy="36" rx="7" ry="11" fill={P} transform={`rotate(${r} 50 50)`} />
      ))}
    </g>
    <circle cx="50" cy="50" r="6" fill={S} />
    <path d="M50 60Q58 78 44 84" stroke={T} strokeWidth="3" fill="none" strokeDasharray="5 4" className="thread" />
  </svg>
);

export const PotSvg: React.FC = () => (
  <svg viewBox="0 0 100 100" className="mo">
    <path
      d="M36 22H64V30Q86 40 82 66Q78 92 50 92Q22 92 18 66Q14 40 36 30Z"
      fill="#C8552D"
      stroke="#3A1630"
      strokeWidth="2.5"
    />
    <rect x="32" y="16" width="36" height="8" rx="4" fill="#A9421F" stroke="#3A1630" strokeWidth="2.5" />
    <path
      d="M22 56Q50 68 78 56"
      stroke="#FFE9A8"
      strokeWidth="4"
      fill="none"
      strokeDasharray="2 7"
      strokeLinecap="round"
    />
    <path d="M26 72Q50 84 74 72" stroke={S} strokeWidth="4" fill="none" />
    <g className="sway">
      <path d="M50 16V6" stroke={T} strokeWidth="3" />
      <circle cx="50" cy="5" r="4" fill={P} />
    </g>
  </svg>
);

export const BanglesSvg: React.FC = () => {
  const rings: Array<[string, number]> = [
    [P, 74],
    [S, 60],
    [T, 46],
    ['#8FA8F0', 32],
  ];
  return (
    <svg viewBox="0 0 100 100" className="mo">
      {rings.map(([c, y], i) => (
        <g key={i} className="bob" style={{ animationDelay: `${-i * 0.3}s` }}>
          <ellipse cx="50" cy={y} rx="34" ry="12" fill="none" stroke={c} strokeWidth="7" />
          <path
            d={`M20 ${y}q10 8 30 8t30-8`}
            stroke="#fff"
            strokeWidth="1.5"
            fill="none"
            strokeDasharray="1 5"
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  );
};
