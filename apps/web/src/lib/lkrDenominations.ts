/** @format */

export type LkrDenomination = {
  value: number;
  label: string;
  type: "NOTE" | "COIN";
  imageUrl: string | null;
};

const IMAGE_BASE = "/images/currency/lkr";

export const LKR_DENOMINATIONS: LkrDenomination[] = [
  {
    value: 5000,
    label: "Rs. 5,000",
    type: "NOTE",
    imageUrl: `${IMAGE_BASE}/5000-F.webp`,
  },
  {
    value: 1000,
    label: "Rs. 1,000",
    type: "NOTE",
    imageUrl: `${IMAGE_BASE}/1000-F.webp`,
  },
  {
    value: 500,
    label: "Rs. 500",
    type: "NOTE",
    imageUrl: `${IMAGE_BASE}/500-F.webp`,
  },
  {
    value: 100,
    label: "Rs. 100",
    type: "NOTE",
    imageUrl: `${IMAGE_BASE}/100-F.webp`,
  },
  {
    value: 50,
    label: "Rs. 50",
    type: "NOTE",
    imageUrl: `${IMAGE_BASE}/50-F.webp`,
  },
  {
    value: 20,
    label: "Rs. 20",
    type: "NOTE",
    imageUrl: `${IMAGE_BASE}/20-F.webp`,
  },
  {
    value: 10,
    label: "Rs. 10",
    type: "COIN",
    imageUrl: null,
  },
  {
    value: 5,
    label: "Rs. 5",
    type: "COIN",
    imageUrl: null,
  },
  {
    value: 2,
    label: "Rs. 2",
    type: "COIN",
    imageUrl: null,
  },
  {
    value: 1,
    label: "Rs. 1",
    type: "COIN",
    imageUrl: null,
  },
];