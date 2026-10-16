// Sample data for DEMO mode only — the two real documents used as the acceptance test:
//  • Transfer slip Số 0001955 (7 Sep 2026, PRO → WH). Items, quantities and work orders are taken from
//    the "Nhận thành phẩm" rows of STOCK REPORT Print for that day. Only line 1's carton split is known
//    from the paper (34T(100) + 1T(40)); the other lines are entered as quantities only.
//  • Packing list IDE0004000 (11 Sep 2026), quantities and weights exactly as on the paper packing list.
//    The customer name is replaced with a neutral one because this file is published with the app.

import { itemToRow } from './store.js';

export const SAMPLE_ITEMS = [
  { code: 'ILPLOV02150003', ref: '9010780009', desc: 'Printed box', uom: 'piece', ppc: 100 },
  { code: 'ILPPTX02019018', ref: '9140260041', desc: 'Printed paper card', uom: 'piece' },
  { code: 'ILPPTX02021060', ref: '9140290150', desc: 'Printed paper card', uom: 'piece' },
  { code: 'ILPLOV02031208', ref: '9141300217', desc: 'Printed box', uom: 'piece' },
  { code: 'ILPLOV02394002', ref: '9142690002', desc: 'Printed box', uom: 'piece' },
  { code: 'ILPDIM13033191', ref: '9090070468', desc: 'Printed hanger collar', uom: 'piece', ppc: 900, l: 35, w: 25, h: 27, nw: 8.95, gw: 9.45, cust: 'Sample Customer' },
  { code: 'ILPDIM13033192', ref: '9090070469', desc: 'Printed hanger collar', uom: 'piece', ppc: 900, l: 35, w: 25, h: 27, nw: 8.95, gw: 9.45, cust: 'Sample Customer' },
].map(itemToRow);

export function sampleRecords() {
  const t = Date.parse('2026-09-07T09:00:00');
  return [
    {
      id: 'S1955A0B', type: 'handoff', docNo: '0001955', date: '2026-09-07', status: 'active',
      fromWh: 'PRO', toWh: 'PRINT', deliveredBy: '', receivedBy: 'Kho Print', note: 'Sample — recreated from the paper slip',
      nextLn: 6, scans: [], createdAt: t, updatedAtClient: t, rev: 1, history: [{ at: t, action: 'created', device: 'sample' }],
      lines: [
        { ln: 1, code: 'ILPLOV02150003', ref: '9010780009', desc: 'Printed box', unit: 'piece', reqQty: '', qty: 3440, ppc: 100, wo: '10131' },
        { ln: 2, code: 'ILPPTX02019018', ref: '9140260041', desc: 'Printed paper card', unit: 'piece', reqQty: '', qty: 3120, ppc: '', wo: '10104' },
        { ln: 3, code: 'ILPPTX02021060', ref: '9140290150', desc: 'Printed paper card', unit: 'piece', reqQty: '', qty: 6100, ppc: '', wo: '10105' },
        { ln: 4, code: 'ILPLOV02031208', ref: '9141300217', desc: 'Printed box', unit: 'piece', reqQty: '', qty: 2800, ppc: '', wo: '10151' },
        { ln: 5, code: 'ILPLOV02394002', ref: '9142690002', desc: 'Printed box', unit: 'piece', reqQty: '', qty: 4330, ppc: '', wo: '101744' },
      ],
    },
    {
      id: 'S4000PKG', type: 'shipment', docNo: 'IDE0004000', date: '2026-09-11', status: 'active',
      fromWh: 'PACK', toWh: '', customer: 'Sample Customer Co., Ltd.', shipTo: 'Bien Hoa factory', contact: '', salesperson: '',
      shippingMark: 'IDEA L PACK', origin: 'VIETNAM', noteNo: '', note: 'Sample — recreated from the paper packing list',
      nextLn: 3, scans: [], createdAt: t + 4 * 864e5, updatedAtClient: t + 4 * 864e5, rev: 1, history: [{ at: t + 4 * 864e5, action: 'created', device: 'sample' }],
      lines: [
        { ln: 1, po: '', code: 'ILPDIM13033191', ref: '9090070468', desc: 'Printed hanger collar', unit: 'piece', qty: 8963, ppc: 900, nw: 8.95, gw: 9.45, pnw: 2.6, pgw: 3.1, l: 35, w: 25, h: 27, printDate: '', packDate: '' },
        { ln: 2, po: '', code: 'ILPDIM13033192', ref: '9090070469', desc: 'Printed hanger collar', unit: 'piece', qty: 4046, ppc: 900, nw: 8.95, gw: 9.45, pnw: 2.6, pgw: 3.1, l: 35, w: 25, h: 27, printDate: '', packDate: '' },
      ],
    },
  ];
}
