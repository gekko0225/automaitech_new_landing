export const PRICING = {
  diagnostic: {
    amount: "199.000",
    currency: "COP",
    display: "$199.000 COP",
    discountMessage:
      "El valor del diagnóstico se descuenta completamente si implementas uno de nuestros sistemas.",
  },

  captacion: {
    amount: "799.000",
    currency: "COP",
    display: "$799.000 COP",
    discountMessage:
      "Si realizaste el Diagnóstico Operativo Inteligente, descontamos los $199.000 del diagnóstico. El valor final del proyecto continúa siendo de $799.000 COP.",
  },
} as const;

export type Pricing = typeof PRICING;