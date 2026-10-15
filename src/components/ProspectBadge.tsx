import React from 'react';
import { Sparkles, Star, Award } from 'lucide-react';

export type ProspectTag = 'wonderkid' | 'top_prospect' | 'top_talent' | null;

export const getProspectTag = (pa?: number, age?: number): ProspectTag => {
  if (!pa || isNaN(pa)) return null;
  // Tags are reserved for youth players under 22 years old (age < 22)
  if (age !== undefined && !isNaN(age) && age >= 22) return null;
  if (pa >= 170) return 'wonderkid';
  if (pa >= 150) return 'top_prospect';
  if (pa >= 130) return 'top_talent';
  return null;
};

interface ProspectBadgeProps {
  pa?: number;
  age?: number;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

export const ProspectBadge: React.FC<ProspectBadgeProps> = ({
  pa,
  age,
  size = 'sm',
  showIcon = true,
  className = ''
}) => {
  const tag = getProspectTag(pa, age);
  if (!tag) return null;

  if (tag === 'wonderkid') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-black rounded-full border shadow-sm tracking-wide bg-gradient-to-r from-amber-500/25 via-purple-500/25 to-pink-500/25 text-amber-200 border-amber-500/50 ${
          size === 'sm' ? 'text-[9px] px-1.5 py-0.5' : 'text-[11px] px-2.5 py-0.5'
        } ${className}`}
        title={`Wonderkid (PA: ${pa}${age ? `, Età: ${age}` : ''}) - Potenziale Mondiale 170+ (< 22 anni)`}
      >
        {showIcon && <Sparkles className={`${size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} text-amber-300 fill-amber-300 shrink-0`} />}
        <span>Wonderkid</span>
      </span>
    );
  }

  if (tag === 'top_prospect') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-bold rounded-full border bg-cyan-500/20 text-cyan-300 border-cyan-500/40 ${
          size === 'sm' ? 'text-[9px] px-1.5 py-0.5' : 'text-[11px] px-2.5 py-0.5'
        } ${className}`}
        title={`Top Prospect (PA: ${pa}${age ? `, Età: ${age}` : ''}) - Alto Potenziale 150-169 (< 22 anni)`}
      >
        {showIcon && <Star className={`${size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} text-cyan-300 fill-cyan-300 shrink-0`} />}
        <span>Top Prospect</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-full border bg-emerald-500/20 text-emerald-300 border-emerald-500/40 ${
        size === 'sm' ? 'text-[9px] px-1.5 py-0.5' : 'text-[11px] px-2.5 py-0.5'
      } ${className}`}
      title={`Top Talent (PA: ${pa}${age ? `, Età: ${age}` : ''}) - Potenziale 130-149 (< 22 anni)`}
    >
      {showIcon && <Award className={`${size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} text-emerald-300 shrink-0`} />}
      <span>Top Talent</span>
    </span>
  );
};


