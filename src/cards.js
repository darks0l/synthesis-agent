// ── Cards Module ────────────────────────────────────────────────────
// Integrates DARKSOL prepaid card ordering into the agent loop.
// The agent converts USDC profits → prepaid Visa/Mastercard cards.
// Closes the real-world loop: trade → earn → spend.
//
// API: acp.darksol.net/cards
// ────────────────────────────────────────────────────────────────────

import { config } from './config.js';
import { log } from './logger.js';

const CARDS_API = process.env.CARDS_API || 'https://acp.darksol.net/cards';

export class CardManager {
  constructor() {
    this.lastOrder = null;
    this.totalOrdered = 0;
    this.orderHistory = [];
  }

  // ── Check available card options ──
  async getCardOptions() {
    try {
      const resp = await fetch(`${CARDS_API}/options`, {
        headers: { 'Accept': 'application/json' },
      });
      if (!resp.ok) {
        log('warn', `Cards API /options returned ${resp.status}`);
        return null;
      }
      const data = await resp.json();
      log('info', `Cards: ${data.cards?.length || 0} card options available`);
      return data;
    } catch (err) {
      log('warn', `Cards API unreachable: ${err.message}`);
      return null;
    }
  }

  // ── Get supported crypto payment methods ──
  async getPaymentMethods() {
    try {
      const resp = await fetch(`${CARDS_API}/payment-methods`, {
        headers: { 'Accept': 'application/json' },
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (err) {
      log('warn', `Cards payment-methods error: ${err.message}`);
      return null;
    }
  }

  // ── Order a prepaid card ──
  async orderCard({ amount, currency = 'USD', crypto = 'USDC', network = 'base', email }) {
    try {
      const orderPayload = {
        amount,
        currency,
        crypto,
        network,
        email: email || null,
        agentAddress: config.agentAddress,
      };

      log('info', `Cards: ordering $${amount} ${currency} card, paying with ${crypto} on ${network}`);

      const resp = await fetch(`${CARDS_API}/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(orderPayload),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => 'unknown');
        log('warn', `Cards order failed (${resp.status}): ${errText}`);
        return { success: false, error: errText, status: resp.status };
      }

      const result = await resp.json();
      this.lastOrder = { ...result, timestamp: Date.now() };
      this.orderHistory.push(this.lastOrder);
      this.totalOrdered += amount;

      log('info', `Cards: order placed — ID: ${result.orderId || 'pending'}, payment: ${result.paymentAddress || 'see response'}`);
      return { success: true, ...result };
    } catch (err) {
      log('error', `Cards order error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // ── Check order status ──
  async checkOrderStatus(orderId) {
    try {
      const resp = await fetch(`${CARDS_API}/order/${orderId}`, {
        headers: { 'Accept': 'application/json' },
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (err) {
      log('warn', `Cards status check error: ${err.message}`);
      return null;
    }
  }

  // ── Evaluate whether to order a card (autonomous decision) ──
  shouldOrderCard(usdcBalance, ethBalance) {
    // Minimum thresholds before considering card purchase
    const MIN_USDC_FOR_CARD = 25;        // Need at least $25 profit
    const RESERVE_USDC = 5;               // Keep $5 for trading
    const RESERVE_ETH = 0.002;            // Keep ETH for gas

    if (usdcBalance < MIN_USDC_FOR_CARD) {
      return { should: false, reason: `USDC balance ($${usdcBalance}) below $${MIN_USDC_FOR_CARD} threshold` };
    }

    if (ethBalance < RESERVE_ETH) {
      return { should: false, reason: `ETH too low for gas (${ethBalance})` };
    }

    const available = usdcBalance - RESERVE_USDC;
    // Round down to nearest $5 increment
    const cardAmount = Math.floor(available / 5) * 5;

    if (cardAmount < 10) {
      return { should: false, reason: `Available after reserve ($${available}) too low for minimum card ($10)` };
    }

    return {
      should: true,
      reason: `$${cardAmount} available after $${RESERVE_USDC} reserve`,
      amount: cardAmount,
    };
  }

  // ── Health check ──
  async healthCheck() {
    try {
      const resp = await fetch(CARDS_API, { method: 'GET' });
      return resp.ok;
    } catch {
      return false;
    }
  }

  // ── Stats for reporting ──
  getStats() {
    return {
      totalOrdered: this.totalOrdered,
      orderCount: this.orderHistory.length,
      lastOrder: this.lastOrder,
      apiEndpoint: CARDS_API,
    };
  }
}
