/**
 * Type surface for the official Cashfree JS checkout SDK (the package ships
 * no .d.ts). Only what the recharge flow uses: load() → checkout() in modal
 * mode, resolving when the customer completes or closes the payment.
 */
declare module '@cashfreepayments/cashfree-js' {
  export interface CashfreeCheckoutOptions {
    paymentSessionId: string;
    /** '_modal' keeps checkout inside the SPA (no redirect/router needed). */
    redirectTarget?: '_modal' | '_self' | '_blank' | '_top';
    returnUrl?: string;
  }

  export interface CashfreeCheckoutResult {
    error?: { message?: string; [key: string]: unknown };
    redirect?: boolean;
    paymentDetails?: { paymentMessage?: string; [key: string]: unknown };
  }

  export interface CashfreeInstance {
    checkout(options: CashfreeCheckoutOptions): Promise<CashfreeCheckoutResult>;
  }

  export function load(options: { mode: 'sandbox' | 'production' }): Promise<CashfreeInstance>;
}
