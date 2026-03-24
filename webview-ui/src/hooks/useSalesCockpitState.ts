import { useEffect, useState } from 'react';
import { isInboundMessage, WebviewOutboundMessage } from '../types/messages';
import { coerceSalesCockpitState, createDefaultSalesCockpitState, SalesCockpitState } from '../utils/salesCockpitUtils';

type UseSalesCockpitStateResult = {
  salesCockpit: SalesCockpitState;
  saveSalesCockpit: (next: SalesCockpitState) => void;
};

export function useSalesCockpitState(): UseSalesCockpitStateResult {
  const [salesCockpit, setSalesCockpit] = useState<SalesCockpitState>(() => {
    return coerceSalesCockpitState(window.initialData?.salesCockpit || createDefaultSalesCockpitState());
  });

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isInboundMessage(event.data)) return;
      if (event.data.type !== 'salesCockpitUpdate') return;
      setSalesCockpit(coerceSalesCockpitState(event.data.salesCockpit));
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const saveSalesCockpit = (next: SalesCockpitState) => {
    const normalized = coerceSalesCockpitState(next);
    setSalesCockpit(normalized);
    if (!window.vscode) return;
    const message: WebviewOutboundMessage = {
      type: 'salesCockpit.save',
      salesCockpit: normalized
    };
    window.vscode.postMessage(message);
  };

  return {
    salesCockpit,
    saveSalesCockpit
  };
}
