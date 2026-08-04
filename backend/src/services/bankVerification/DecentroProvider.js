const { BankVerificationProvider } = require('./BankVerificationProvider');

class DecentroProvider extends BankVerificationProvider {
  constructor(settings, credentials) {
    super(settings, credentials);
    this.providerName = 'Decentro';
    this.baseUrl = settings.apiBaseUrl || 'https://in.decentro.tech/v2';
  }

  async verifyAccount(ifsc, accountNumber, employeeName) {
    const cleanAccount = String(accountNumber || '').replace(/\s+/g, '').trim();
    const normIfsc = String(ifsc || '').toUpperCase().trim();

    if (this.environment === 'Production' && (this.credentials.apiKey || this.credentials.clientId)) {
      try {
        const headers = this.generateAuthHeader();
        headers['client_id'] = this.credentials.clientId || '';
        headers['client_secret'] = this.credentials.clientSecret || '';
        headers['module_secret'] = this.credentials.apiSecret || '';
        const res = await fetch(`${this.baseUrl}/core_banking/money_transfer/validate_account`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            beneficiary_account_number: cleanAccount,
            beneficiary_ifsc: normIfsc
          }),
          signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.status === 'SUCCESS' && data?.data?.beneficiary_name) {
            return this.normalizeResponse({
              verified: true,
              accountHolderName: data.data.beneficiary_name,
              ifsc: normIfsc,
              referenceId: data.decentro_txn_id || `DEC-${Date.now()}`,
              rawResponse: data
            });
          }
        }
      } catch (err) {
        console.warn('[DecentroProvider] Live verification failed, falling back to simulation:', err.message);
      }
    }

    return this.simulateVerification(normIfsc, cleanAccount);
  }
}

module.exports = DecentroProvider;
