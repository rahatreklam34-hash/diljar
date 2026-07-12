declare module 'iyzipay' {
  interface IyzipayConfig { apiKey: string; secretKey: string; uri: string; }
  class Iyzipay {
    constructor(config: IyzipayConfig);
    threedsInitialize: { create: (request: any, callback: (err: any, result: any) => void) => void };
    threedsPayment: { create: (request: any, callback: (err: any, result: any) => void) => void };
    installmentInfo: { retrieve: (request: any, callback: (err: any, result: any) => void) => void };
    payment: { create: (request: any, callback: (err: any, result: any) => void) => void };
    static LOCALE: { TR: string; EN: string };
    static CURRENCY: { TRY: string; EUR: string; USD: string; GBP: string };
    static PAYMENT_CHANNEL: { WEB: string; MOBILE: string; MOBILE_WEB: string };
    static PAYMENT_GROUP: { PRODUCT: string; LISTING: string; SUBSCRIPTION: string };
  }
  export = Iyzipay;
}
