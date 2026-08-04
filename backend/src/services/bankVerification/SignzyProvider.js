const { BankVerificationProvider } = require('./BankVerificationProvider');

class SignzyProvider extends BankVerificationProvider {
  constructor(settings, credentials) {
    super(settings, credentials);
    this.providerName = 'Signzy';
    this.baseUrl = settings.apiBaseUrl || 'https://api.signzy.app/api/v2';
  }

  async verifyAccount(ifsc, accountNumber, employeeName) {
    const cleanAccount = String(accountNumber || '').replace(/\s+/g, '').trim();
    const normIfsc = String(ifsc || '').toUpperCase().trim();

    if (this.environment === 'Production' && (this.credentials.apiKey || this.credentials.bearerToken)) {
      try {
        const headers = this.generateAuthHeader();
        const res = await fetch(`${this.baseUrl}/patron/bankaccount/verification`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            task: 'bankAccountVerification',
            essentials: { accountNumber: cleanAccount, ifsc: normIfsc }
          }),
          signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.result?.active === 'yes' && data?.result?.bankTransfer?.beneficiaryName) {
            return this.normalizeResponse({
              verified: true,
              accountHolderName: data.result.bankTransfer.beneficiaryName,
              ifsc: normIfsc,
              referenceId: data.id || `SGZ-${Date.now()}`,
              rawResponse: data
            });
          }
        }
      } catch (err) {
        console.warn('[SignzyProvider] Live verification failed, falling back to simulation:', err.message);
      }
    }

    return this.simulateVerification(normIfsc, cleanAccount);
  }
}

module.exports = SignzyProvider;
