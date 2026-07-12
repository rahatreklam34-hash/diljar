import { useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * useUrlState
 * ------------
 * URL query-string tabanli, useState API'sine yakin bir hook.
 * Filtre / sekme / arama / sayfa durumunu URL'de tutarak deep-link ve
 * geri gelince (veya sayfa yenilenince) state korunmasi saglar.
 *
 * Kullanim (useState ile birebir ayni imza):
 *   const [tab, setTab] = useUrlState('tab', 'tumu');
 *   const [page, setPage] = useUrlState('page', 1);
 *   const [open, setOpen] = useUrlState('open', false);
 *
 * Ozellikler:
 *  - string | number | boolean serialize/deserialize (otomatik, default degerin tipinden cikarilir).
 *  - Deger default'a esitse query'yi KIRLETMEZ (param URL'e yazilmaz / silinir).
 *  - Guncellemeler varsayilan olarak `replace:true` ile yapilir -> history spam olmaz.
 *  - setValue hem dogrudan deger hem de (prev)=>next fonksiyonu kabul eder (useState gibi).
 */

export interface UseUrlStateOpts {
  /** history.push yerine replace kullan (varsayilan: true) -> geri tusu spam'lenmez */
  replace?: boolean;
}

type Serializable = string | number | boolean;

// Literal tipleri temel primitive'e genislet: 1 -> number, 'x' -> string, true -> boolean.
// Bu sayede `useUrlState('page', 1)` cagrisi `number` doner (literal `1` degil),
// ve `setPage(page + 1)` gibi kullanimlar TS hatasi vermez.
type Widen<T> = T extends number ? number : T extends boolean ? boolean : T extends string ? string : T;

function toParam(v: Serializable): string {
  if (typeof v === 'boolean') return v ? '1' : '0';
  return String(v);
}

function fromParam<T extends Serializable>(raw: string, def: T): T {
  if (typeof def === 'number') {
    const n = Number(raw);
    return (Number.isNaN(n) ? def : (n as T));
  }
  if (typeof def === 'boolean') {
    return ((raw === '1' || raw === 'true') as unknown) as T;
  }
  return (raw as unknown) as T;
}

export function useUrlState<T extends Serializable>(
  key: string,
  defaultValue: T,
  opts: UseUrlStateOpts = {},
): [Widen<T>, (next: Widen<T> | ((prev: Widen<T>) => Widen<T>)) => void] {
  const { replace = true } = opts;
  const [params, setParams] = useSearchParams();

  const raw = params.get(key);
  const value = (raw === null ? defaultValue : fromParam(raw, defaultValue)) as Widen<T>;

  // setValue icin guncel value'yu referansta tutarak, fonksiyonel updater'lari
  // stale-closure olmadan destekle.
  const valueRef = useRef(value);
  valueRef.current = value;

  const setValue = useCallback(
    (next: Widen<T> | ((prev: Widen<T>) => Widen<T>)) => {
      const resolved =
        typeof next === 'function'
          ? (next as (prev: Widen<T>) => Widen<T>)(valueRef.current)
          : next;

      // ONEMLI: react-router `setSearchParams(fn)` fonksiyonel updater'inda `prev`,
      // React state'inden gelir ve ayni tick'te art arda cagrilan iki setter
      // (orn. `setSearch(x); setPage(1);`) ikisi de GUNCELLENMEMIS `prev`'i gorur ->
      // ikinci cagri birincinin yazdigi parametreyi EZER (arama silinir).
      // Bunu onlemek icin, react-router history'yi senkron gunceller; bu yuzden
      // guncel parametreleri CANLI `window.location.search`'ten okuyup uzerine yaziyoruz.
      // Boylece ayni tick'teki birden fazla setter birbirini ezmeden birlesir.
      const sp =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(params);
      // Default deger ise query'yi kirletme -> param'i sil.
      if (resolved === (defaultValue as unknown as Widen<T>)) {
        sp.delete(key);
      } else {
        sp.set(key, toParam(resolved));
      }
      setParams(sp, { replace });
    },
    [key, defaultValue, replace, setParams],
  );

  return [value, setValue];
}

export default useUrlState;
