export const PRICING = {
  captacion: {
    amount: "799.000",
    currency: "COP",
    display: "$799.000 COP",
  },
} as const;

export type Pricing = typeof PRICING;