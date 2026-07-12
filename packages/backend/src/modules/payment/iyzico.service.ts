/**
 * iyzico Ödeme Entegrasyonu — 3D Secure zorunlu
 */
import Iyzipay from 'iyzipay';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface IyzicoConfig {
  api_key: string;
  secret_key: string;
}

/** Tenant'ın iyzico ayarlarını oku ve Iyzipay instance döndür */
export async function getIyzico(tenantId: string): Promise<{ iyzipay: any; config: IyzicoConfig; testMode: boolean } | null> {
  const s = await prisma.integrationSetting.findFirst({ where: { tenantId, provider: 'iyzico', enabled: true } });
  if (!s) return null;
  const c: any = s.config || {};
  if (!c.api_key || !c.secret_key) return null;
  const baseUrl = s.mode === 'LIVE' ? 'https://api.iyzipay.com' : 'https://sandbox-api.iyzipay.com';
  const iyzipay = new Iyzipay({ apiKey: c.api_key, secretKey: c.secret_key, uri: baseUrl });
  return { iyzipay, config: c as IyzicoConfig, testMode: s.mode !== 'LIVE' };
}

/** Taksit seçeneklerini sorgula (BIN ilk 6 hane) */
export function queryInstallment(iyzipay: any, binNumber: string, price: number): Promise<any> {
  return new Promise((resolve, reject) => {
    iyzipay.installmentInfo.retrieve({
      locale: Iyzipay.LOCALE.TR,
      conversationId: `inst_${Date.now()}`,
      binNumber: binNumber.replace(/\s/g, '').slice(0, 6),
      price: price.toFixed(2),
    }, (err: any, result: any) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

/** 3D Secure ödeme başlat */
export function initThreeDS(iyzipay: any, params: {
  conversationId: string;
  price: number;
  paidPrice: number;
  installment: number;
  basketId: string;
  callbackUrl: string;
  buyer: { id: string; name: string; surname: string; email: string; phone: string; ip: string; address: string; city: string; country: string; identityNumber?: string };
  shippingAddress: { address: string; city: string; country: string; contactName: string };
  billingAddress: { address: string; city: string; country: string; contactName: string };
  basketItems: Array<{ id: string; name: string; category1: string; itemType: string; price: number }>;
  card: { holderName: string; number: string; expMonth: string; expYear: string; cvc: string };
}): Promise<any> {
  return new Promise((resolve, reject) => {
    const p = params;
    const request: any = {
      locale: Iyzipay.LOCALE.TR,
      conversationId: p.conversationId,
      price: p.price.toFixed(2),
      paidPrice: p.paidPrice.toFixed(2),
      currency: Iyzipay.CURRENCY.TRY,
      installment: p.installment,
      basketId: p.basketId,
      paymentChannel: Iyzipay.PAYMENT_CHANNEL.WEB,
      paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
      callbackUrl: p.callbackUrl,
      buyer: {
        id: p.buyer.id,
        name: p.buyer.name,
        surname: p.buyer.surname,
        gsmNumber: p.buyer.phone,
        email: p.buyer.email,
        identityNumber: p.buyer.identityNumber || '11111111111',
        registrationAddress: p.buyer.address,
        ip: p.buyer.ip,
        city: p.buyer.city,
        country: p.buyer.country,
      },
      shippingAddress: {
        contactName: p.shippingAddress.contactName,
        city: p.shippingAddress.city,
        country: p.shippingAddress.country,
        address: p.shippingAddress.address,
      },
      billingAddress: {
        contactName: p.billingAddress.contactName,
        city: p.billingAddress.city,
        country: p.billingAddress.country,
        address: p.billingAddress.address,
      },
      basketItems: p.basketItems.map((bi) => ({
        id: bi.id,
        name: bi.name.slice(0, 50),
        category1: bi.category1.slice(0, 50),
        itemType: bi.itemType,
        price: bi.price.toFixed(2),
      })),
      paymentCard: {
        cardHolderName: p.card.holderName,
        cardNumber: p.card.number.replace(/\s/g, ''),
        expireMonth: p.card.expMonth,
        expireYear: p.card.expYear,
        cvc: p.card.cvc,
        registerCard: '0',
      },
    };
    iyzipay.threedsInitialize.create(request, (err: any, result: any) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

/** 3D Secure ödemeyi tamamla */
export function completeThreeDS(iyzipay: any, paymentId: string, conversationId?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    iyzipay.threedsPayment.create({
      locale: Iyzipay.LOCALE.TR,
      conversationId: conversationId || `comp_${Date.now()}`,
      paymentId,
    }, (err: any, result: any) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}
