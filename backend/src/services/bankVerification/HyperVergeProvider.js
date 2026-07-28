const { BankVerificationProvider } = require('./BankVerificationProvider');

class HyperVergeProvider extends BankVerificationProvider {
  constructor(settings, credentials) {
    super(settings, credentials);
    this.providerName = 'HyperVerge';
    this.baseUrl = settings.apiBaseUrl || 'https://ind-verif.hyperverge.co/v1';
  }

  async verifyAccount(ifsc, accountNumber, employeeName) {
    const cleanAccount = String(accountNumber || '').replace(/\s+/g, '').trim();
    const normIfsc = String(ifsc || '').toUpperCase().trim();

    if (this.environment === 'Production' && (this.credentials.apiKey || this.credentials.bearerToken || (this.credentials.clientId && this.credentials.clientSecret))) {
      try {
        const headers = this.generateAuthHeader();
        headers['appId'] = this.credentials.clientId || this.credentials.apiKey || '';
        headers['appKey'] = this.credentials.clientSecret || this.credentials.apiSecret || '';
        const res = await fetch(`${this.baseUrl}/checkPennyDrop`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            accountNumber: cleanAccount,
            ifsc: normIfsc
          }),
          signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.status === 'success' && data?.result?.accountStatus === 'active' && data?.result?.bankAccountName) {
            return this.normalizeResponse({
              verified: true,
              accountHolderName: data.result.bankAccountName,
              ifsc: normIfsc,
              referenceId: data.transactionId || `HV-${Date.now()}`,
              rawResponse: data
            });
          }
        }
      } catch (err) {
        console.warn('[HyperVergeProvider] Live verification failed, falling back to simulation:', err.message);
      }
    }

    return this.simulateVerification(normIfsc, cleanAccount);
  }
}

module.exports = HyperVergeProvider;
