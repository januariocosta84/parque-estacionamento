// Receipt text the agent shares with the driver.
import { describe, expect, it } from 'vitest';
import { translate } from '@estacionamento/shared';
import type { MessageKey, MessageParams, Receipt } from '@estacionamento/shared';
import { receiptShareText } from '../src/receipt-share';

const receipt: Receipt = {
  ticketId: '7d1c1f9e-3c1a-4a55-9a43-1f0f3b8a2c11',
  receiptNo: 'REC-2538668',
  serial: '2538668/MAE/A.M.DILI',
  plate: 'A-2847-TL',
  vehicleClassId: 'moto',
  entryAt: '2026-10-17T00:20:00.000Z', // 09:20 in Dili
  exitAt: '2026-10-17T02:05:00.000Z', // 11:05 in Dili
  hoursCharged: 2,
  tariffCentsPerHour: 50,
  amountCents: 100,
  receivedCents: 500,
  changeCents: 400,
  method: 'CASH',
  agent: { id: 'a1', name: 'Maria Soares', agentNumber: 'AMD-001' },
  paymentRef: 'EVT-2538668-03',
  paidAt: '2026-10-17T02:05:00.000Z',
};

const tr = (locale: 'pt' | 'tet') => (key: MessageKey, params?: MessageParams) =>
  translate(locale, key, params);

describe('receiptShareText', () => {
  it('has everything the driver needs, in Dili time and cents-exact dollars', () => {
    const text = receiptShareText(receipt, 'Motorizada', tr('pt'));
    expect(text).toContain('Autoridade Municipal de Dili');
    expect(text).toContain('Recibo de pagamento REC-2538668');
    expect(text).toContain('Título: 2538668/MAE/A.M.DILI');
    expect(text).toContain('Matrícula: A-2847-TL · Motorizada');
    expect(text).toContain('Entrada / saída: 09:20 / 11:05');
    expect(text).toContain('Horas cobradas: 2 h · $0,50/h');
    expect(text).toContain('Total pago: $1,00 USD');
    expect(text).toContain('Método: Numerário');
    expect(text).toContain('Agente: Maria Soares · AMD-001');
    expect(text).toContain('Referência: EVT-2538668-03');
  });

  it('follows the app language and leaves the vehicle out when unknown', () => {
    const text = receiptShareText(receipt, undefined, tr('tet'));
    expect(text).toContain('Resibu pagamentu REC-2538668');
    expect(text).toContain('Matríkula: A-2847-TL\n');
  });
});
