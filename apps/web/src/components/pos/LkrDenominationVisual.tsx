/** @format */

import { useState } from "react";
import { Coins } from "lucide-react";

import type { LkrDenomination } from "../../lib/lkrDenominations";

type Props = {
  denomination: LkrDenomination;
  className?: string;
};

export default function LkrDenominationVisual({
  denomination,
  className = "",
}: Props) {
  const [imageFailed, setImageFailed] = useState(false);

  if (denomination.type === "COIN") {
    return (
      <div
        className={`flex h-14 w-24 items-center justify-center rounded-xl border border-bauraBorder bg-bauraCanvas2 ${className}`}
      >
        <Coins size={27} strokeWidth={1.5} className="text-bauraGoldDark" />
      </div>
    );
  }

  if (!denomination.imageUrl || imageFailed) {
    return (
      <div
        className={`flex h-14 w-24 items-center justify-center rounded-xl border border-bauraBorder bg-bauraCanvas2 ${className}`}
      >
        <span className="text-[11px] font-semibold text-bauraInk">
          {denomination.label}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex h-14 w-24 items-center justify-center overflow-hidden rounded-xl border border-bauraBorder bg-white p-1 ${className}`}
    >
      <img
        src={denomination.imageUrl}
        alt={`${denomination.label} Sri Lankan banknote`}
        loading="lazy"
        draggable={false}
        onError={() => setImageFailed(true)}
        className="h-full w-full object-contain"
      />
    </div>
  );
}