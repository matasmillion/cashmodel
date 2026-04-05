import { generateWeekDates } from './calculations';

const PRODUCTION_DAYS = 35;
const SEA_FREIGHT_DAYS = 35;
const AIR_FREIGHT_DAYS = 9;
const FINAL_PAYMENT_DAYS = 30;

export function schedulePO({ collectionName, products, quantities, deliveryDate, freightMethod = 'sea' }) {
  const freightDays = freightMethod === 'air' ? AIR_FREIGHT_DAYS : SEA_FREIGHT_DAYS;

  const delivery = new Date(deliveryDate + 'T00:00:00');
  const shipmentDate = new Date(delivery);
  shipmentDate.setDate(shipmentDate.getDate() - freightDays);

  const productionStartDate = new Date(shipmentDate);
  productionStartDate.setDate(productionStartDate.getDate() - PRODUCTION_DAYS);

  const finalPaymentDate = new Date(shipmentDate);
  finalPaymentDate.setDate(finalPaymentDate.getDate() + FINAL_PAYMENT_DAYS);

  let totalCost = 0;
  const lineItems = products.map((product, idx) => {
    const qty = quantities[idx] || 0;
    const landedCPU = product.unitCost + (product.weight * product.freightPerKg);
    const lineCost = landedCPU * qty;
    totalCost += lineCost;
    return { product, quantity: qty, landedCPU, lineCost };
  });

  const depositAmount = totalCost * 0.30;
  const preShipmentAmount = totalCost * 0.40;
  const finalAmount = totalCost * 0.30;

  const depositWeekIndex = findWeekIndex(productionStartDate);
  const preShipmentWeekIndex = findWeekIndex(shipmentDate);
  const finalWeekIndex = findWeekIndex(finalPaymentDate);
  const deliveryWeekIndex = findWeekIndex(delivery);

  const payments = [
    {
      label: '30% Deposit (Before Production)',
      amount: depositAmount,
      date: productionStartDate.toISOString().split('T')[0],
      weekIndex: depositWeekIndex,
      percent: 30,
    },
    {
      label: '40% Before Shipment',
      amount: preShipmentAmount,
      date: shipmentDate.toISOString().split('T')[0],
      weekIndex: preShipmentWeekIndex,
      percent: 40,
    },
    {
      label: '30% Final (30 Days After Shipment)',
      amount: finalAmount,
      date: finalPaymentDate.toISOString().split('T')[0],
      weekIndex: finalWeekIndex,
      percent: 30,
    },
  ];

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
    collectionName,
    lineItems,
    totalCost,
    freightMethod,
    deliveryDate,
    productionStartDate: productionStartDate.toISOString().split('T')[0],
    shipmentDate: shipmentDate.toISOString().split('T')[0],
    finalPaymentDate: finalPaymentDate.toISOString().split('T')[0],
    deliveryWeekIndex,
    payments,
  };
}

function findWeekIndex(date) {
  const weekDates = generateWeekDates();
  const target = date instanceof Date ? date : new Date(date + 'T00:00:00');
  for (let i = 0; i < weekDates.length; i++) {
    const weekStart = new Date(weekDates[i] + 'T00:00:00');
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    if (target >= weekStart && target < weekEnd) return i;
  }
  if (target < new Date(weekDates[0] + 'T00:00:00')) return 0;
  return weekDates.length - 1;
}

export function getTimelineSummary(po) {
  return {
    productionStart: po.productionStartDate,
    shipment: po.shipmentDate,
    delivery: po.deliveryDate,
    finalPayment: po.finalPaymentDate,
    totalDays: Math.round((new Date(po.finalPaymentDate) - new Date(po.productionStartDate)) / (1000 * 60 * 60 * 24)),
  };
}
