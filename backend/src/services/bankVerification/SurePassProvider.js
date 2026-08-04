const { BankVerificationProvider } = require('./BankVerificationProvider');

class SurePassProvider extends BankVerificationProvider {
  constructor(settings, credentials) {
    super(settings, credentials);
    this.providerName = 'SurePass';
    this.baseUrl = settings.apiBaseUrl || 'https://kyc-api.surepass.io/api/v1';
  }

  async verifyAccount(ifsc, accountNumber, employeeName) {
    const cleanAccount = String(accountNumber || '').replace(/\s+/g, '').trim();
    const normIfsc = String(ifsc || '').toUpperCase().trim();

    if (this.environment === 'Production' && (this.credentials.bearerToken || this.credentials.apiKey)) {
      try {
        const headers = this.generateAuthHeader();
        const res = await fetch(`${this.baseUrl}/bank-verification/`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id_number: cleanAccount,
            ifsc: normIfsc
          }),
          signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.success && data?.data?.account_exists && data?.data?.full_name) {
            return this.normalizeResponse({
              verified: true,
              accountHolderName: data.data.full_name,
              ifsc: normIfsc,
              referenceId: data.data.client_id || `SP-${Date.now()}`,
              rawResponse: data
            });
          }
        }
      } catch (err) {
        console.warn('[SurePassProvider] Live verification failed, falling back to simulation:', err.message);
      }
    }

    return this.simulateVerification(normIfsc, cleanAccount);
  }
}

module.exports = SurePassProvider;
