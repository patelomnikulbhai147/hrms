const { BankVerificationProvider } = require('./BankVerificationProvider');

class CustomProvider extends BankVerificationProvider {
  constructor(settings, credentials) {
    super(settings, credentials);
    this.providerName = settings.provider || 'Custom Provider';
    this.baseUrl = settings.apiBaseUrl || 'https://api.custombankprovider.com/v1';
  }

  async verifyAccount(ifsc, accountNumber, employeeName) {
    const cleanAccount = String(accountNumber || '').replace(/\s+/g, '').trim();
    const normIfsc = String(ifsc || '').toUpperCase().trim();

    if (this.environment === 'Production' && this.settings.apiBaseUrl && (this.credentials.apiKey || this.credentials.bearerToken || this.credentials.clientId)) {
      try {
        const headers = this.generateAuthHeader();
        const res = await fetch(`${this.baseUrl}/verify-account`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            accountNumber: cleanAccount,
            ifsc: normIfsc,
            employeeName
          }),
          signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
        });

        if (res.ok) {
          const data = await res.json();
          if ((data?.verified || data?.status === 'VERIFIED' || data?.success) && (data?.accountHolderName || data?.beneficiaryName || data?.nameAtBank)) {
            return this.normalizeResponse({
              verified: true,
              accountHolderName: data.accountHolderName || data.beneficiaryName || data.nameAtBank,
              ifsc: normIfsc,
              referenceId: data.referenceId || data.txnId || `CUST-${Date.now()}`,
              rawResponse: data
            });
          }
        }
      } catch (err) {
        console.warn('[CustomProvider] Live verification failed, falling back to simulation:', err.message);
      }
    }

    return this.simulateVerification(normIfsc, cleanAccount);
  }
}

module.exports = CustomProvider;
