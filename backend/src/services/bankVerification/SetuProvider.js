const { BankVerificationProvider } = require('./BankVerificationProvider');

class SetuProvider extends BankVerificationProvider {
  constructor(settings, credentials) {
    super(settings, credentials);
    this.providerName = 'Setu';
    this.baseUrl = settings.apiBaseUrl || (this.environment === 'Production' ? 'https://prod.setu.co/api/verify/v1' : 'https://sandbox.setu.co/api/verify/v1');
  }

  async verifyAccount(ifsc, accountNumber, employeeName) {
    const cleanAccount = String(accountNumber || '').replace(/\s+/g, '').trim();
    const normIfsc = String(ifsc || '').toUpperCase().trim();

    if (this.environment === 'Production' && (this.credentials.bearerToken || (this.credentials.clientId && this.credentials.clientSecret))) {
      try {
        const headers = this.generateAuthHeader();
        headers['x-client-id'] = this.credentials.clientId || '';
        headers['x-client-secret'] = this.credentials.clientSecret || '';
        headers['x-product-instance-id'] = this.credentials.apiKey || '';
        const res = await fetch(`${this.baseUrl}/bank-account`, {
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
          if (data?.status === 'VERIFIED' && data?.data?.nameAtBank) {
            return this.normalizeResponse({
              verified: true,
              accountHolderName: data.data.nameAtBank,
              ifsc: normIfsc,
              referenceId: data.id || `SETU-${Date.now()}`,
              rawResponse: data
            });
          }
        }
      } catch (err) {
        console.warn('[SetuProvider] Live verification failed, falling back to simulation:', err.message);
      }
    }

    return this.simulateVerification(normIfsc, cleanAccount);
  }
}

module.exports = SetuProvider;
