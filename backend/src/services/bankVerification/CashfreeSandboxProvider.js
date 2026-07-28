const { BankVerificationProvider } = require('./BankVerificationProvider');

class CashfreeSandboxProvider extends BankVerificationProvider {
  constructor(settings, credentials) {
    super(settings, credentials);
    // Force provider name and environment for Phase 1 Sandbox
    this.providerName = 'Cashfree Sandbox API';
    this.environment = 'Sandbox';
  }

  async verifyAccount(ifsc, accountNumber, employeeName) {
    // Explicitly bypass network calls and strictly use the simulation layer
    return this.simulateVerification(ifsc, accountNumber);
  }

  async lookupIFSC(ifsc) {
    return { 
      valid: true, 
      ifsc: String(ifsc).toUpperCase(), 
      bankName: 'Cashfree Sandbox Bank', 
      branch: 'Simulation Branch' 
    };
  }

  async getBalance() {
    return { currency: 'INR', balance: 9999999.99, status: 'Sandbox Active' };
  }

  async healthCheck() {
    // Always returns healthy for Sandbox without requiring real credentials
    return { 
      ok: true, 
      status: 'connected', 
      message: `Connected to ${this.providerName} (${this.environment}) successfully.` 
    };
  }
}

module.exports = CashfreeSandboxProvider;
