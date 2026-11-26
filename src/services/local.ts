/**
 * V0.1 service boundary. There is no account, payment, ad, or network API.
 * Callers keep using platform/web storage. This module exists so later
 * versions can replace it without threading sockets through the rules.
 */
export const services = {
  network: false as const,
  accounts: false as const,
  payments: false as const,
  ads: false as const,
};
