const { BankVerificationProvider } = require('./BankVerificationProvider');

class CashfreeProvider extends BankVerificationProvider {
  constructor(settings, credentials) {
    super(settings, credentials);
    this.providerName = 'Cashfree';
    this.baseUrl = settings.apiBaseUrl || (this.environment === 'Production' ? 'https://api.cashfree.com/verification' : 'https://sandbox.cashfree.com/verification');
  }

  async verifyAccount(ifsc, accountNumber, employeeName) {
    const cleanAccount = String(accountNumber || '').replace(/\s+/g, '').trim();
    const normIfsc = String(ifsc || '').toUpperCase().trim();
    const name = String(employeeName || 'Unknown').trim();

    const globalClientId = this.environment === 'Production' ? process.env.CASHFREE_PROD_CLIENT_ID : process.env.CASHFREE_SANDBOX_CLIENT_ID;
    const globalClientSecret = this.environment === 'Production' ? process.env.CASHFREE_PROD_CLIENT_SECRET : process.env.CASHFREE_SANDBOX_CLIENT_SECRET;

    let finalClientId, finalClientSecret;

    if (this.settings.credentialSource === 'Company' && (this.credentials.clientId || this.credentials.apiKey || this.credentials.bearerToken)) {
      finalClientId = this.credentials.clientId || this.credentials.apiKey || this.credentials.bearerToken;
      finalClientSecret = this.credentials.clientSecret || this.credentials.apiSecret || '';
    } else {
      finalClientId = globalClientId;
      finalClientSecret = globalClientSecret;
    }

    const hasCredentials = !!finalClientId;
    if (!hasCredentials) {
      return this.normalizeResponse({
        verified: false,
        status: 'ERROR',
        error: `${this.environment} credentials not configured.`
      });
    }

    try {
      const headers = {
        'x-client-id': finalClientId || '',
        'x-client-secret': finalClientSecret || '',
        'x-api-version': '2022-10-26',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      const payload = {
        bank_account: cleanAccount,
        ifsc: normIfsc,
        name: name
      };

      const res = await fetch(`${this.baseUrl}/bank-account/sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
      });

      const data = await res.json();

      if (!res.ok) {
        return this.normalizeResponse({
          verified: false,
          status: 'FAILED',
          error: `Cashfree API Error: ${data.message || data.code || 'Unknown Error'} (Code: ${res.status})`,
          httpStatus: res.status,
          accountStatusCode: data.code || data.sub_code || null,
          verificationMessage: data.message || null,
          rawResponse: data
        });
      }

      if (data && data.account_status) {
          const isVerified = data.account_status === 'VALID';
          return this.normalizeResponse({
              verified: isVerified,
              status: isVerified ? 'VERIFIED' : 'FAILED',
              accountHolderName: data.name_at_bank || '',
              // Bank/branch detail Cashfree returns alongside the verdict. Field
              // names differ between API versions, so each is read through its
              // known aliases rather than assuming one spelling; anything absent
              // stays null and the controller falls back to the IFSC lookup.
              bankName: data.bank_name || data.bank || null,
              branch: data.branch || data.branch_name || null,
              branchAddress: data.branch_address || data.address || null,
              city: data.city || null,
              district: data.district || null,
              state: data.state || null,
              micr: data.micr || data.micr_code || null,
              swift: data.swift || data.swift_code || null,
              utr: data.utr || data.utr_number || null,
              ifsc: data.ifsc || normIfsc,
              accountStatus: data.account_status || null,
              accountStatusCode: data.account_status_code || null,
              verificationMessage: data.account_status_code || data.message || null,
              verificationSource: 'Cashfree Secure ID',
              verificationId: String(data.verification_id || data.ref_id || data.reference_id || ''),
              requestId: data.request_id || data.cf_request_id || null,
              nameMatchResult: data.name_match_result || null,
              nameMatchScore: data.name_match_score,
              referenceId: String(data.reference_id || data.ref_id || `CF-${Date.now()}`),
              httpStatus: res.status,
              error: isVerified ? null : `Bank Account Status: ${data.account_status}`,
              rawResponse: data
          });
      }

      return this.normalizeResponse({
        verified: false,
        status: 'FAILED',
        error: `Invalid response from Cashfree ${this.environment} Verification`,
        httpStatus: res.status,
        rawResponse: data
      });

    } catch (err) {
      return this.normalizeResponse({
        verified: false,
        status: 'NETWORK_ERROR',
        error: `${this.environment} verification failed: ${err.message}`
      });
    }
  }
}

module.exports = CashfreeProvider;
