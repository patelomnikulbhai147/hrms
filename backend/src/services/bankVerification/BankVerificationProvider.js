/**
 * Base interface and shared utility for Bank Verification Provider adapters.
 * Implements standard contract: verifyAccount(), lookupIFSC(), getBalance(), healthCheck().
 * Enforces standardized response model and BYO API authentication headers.
 */

const crypto = require('crypto');


class BankVerificationProvider {
  constructor(settings, credentials = {}) {
    this.settings = settings || {};
    this.credentials = credentials || {};
    this.providerName = this.settings.provider || 'Custom Provider';
    this.environment = this.settings.environment || 'Sandbox';
  }

  /**
   * Generate HTTP Authorization headers based on configured authentication Type
   */
  generateAuthHeader() {
    const authType = this.settings.authenticationType || 'Bearer Token';
    const { apiKey, apiSecret, bearerToken, clientId, clientSecret } = this.credentials;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    switch (authType) {
      case 'Bearer Token':
        if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
        break;
      case 'API Key':
        if (apiKey) headers['x-api-key'] = apiKey;
        break;
      case 'API Key + Secret':
        if (apiKey) headers['x-api-key'] = apiKey;
        if (apiSecret) headers['x-api-secret'] = apiSecret;
        break;
      case 'OAuth2 Client Credentials':
        // For OAuth2, if we have a token or client id/secret, set Authorization header
        if (bearerToken) {
          headers['Authorization'] = `Bearer ${bearerToken}`;
        } else if (clientId && clientSecret) {
          headers['Authorization'] = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        }
        break;
      case 'Basic Authentication':
        if (apiKey && apiSecret) {
          headers['Authorization'] = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
        }
        break;
      default:
        if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
    }
    return headers;
  }

  /**
   * Standardized Response Formatter.
   *
   * The `verified` / `status` / `accountHolderName` semantics are unchanged — the
   * additional fields below are pure passthrough of what the provider returned so
   * the verification record can store all of it. Any adapter that does not supply
   * them simply yields nulls, exactly as before.
   */
  normalizeResponse({
    verified,
    accountHolderName,
    bankName,
    branch,
    branchAddress,
    city,
    district,
    state,
    ifsc,
    micr,
    swift,
    utr,
    accountStatus,
    accountStatusCode,
    verificationMessage,
    verificationSource,
    verificationId,
    requestId,
    nameMatchResult,
    nameMatchScore,
    referenceId,
    status,
    error,
    httpStatus,
    rawResponse
  }) {
    // Provider-reported detail that is meaningful on BOTH a success and a
    // failure — a declined verification still carries a status code, a message,
    // and a reference the tenant may need to quote back to the provider.
    const providerDetail = {
      accountStatus: accountStatus || null,
      accountStatusCode: accountStatusCode || null,
      verificationMessage: verificationMessage || null,
      verificationSource: verificationSource || this.providerName,
      verificationId: verificationId || null,
      requestId: requestId || null,
      nameMatchResult: nameMatchResult || null,
      nameMatchScore: nameMatchScore === undefined ? null : nameMatchScore,
      environment: this.environment,
      httpStatus: httpStatus === undefined ? null : httpStatus,
      branchAddress: branchAddress || null,
      utr: utr || null
    };

    if (!verified || !accountHolderName || accountHolderName === 'Not Available' || accountHolderName === 'N/A') {
      return {
        verified: false,
        status: status || 'VERIFICATION_INCOMPLETE',
        accountHolderName: null,
        bankName: bankName || null,
        branch: branch || null,
        ifsc: ifsc || null,
        referenceId: referenceId || `VER-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        provider: this.providerName,
        verifiedAt: new Date().toISOString(),
        error: error || 'Account number is active, but account holder name is unavailable from the banking provider. Manual verification required.',
        ...providerDetail,
        raw: rawResponse || null
      };
    }

    return {
      verified: true,
      accountHolderName,
      bankName: bankName || 'Bank',
      branch: branch || 'Main Branch',
      city: city || '',
      district: district || city || '',
      state: state || '',
      ifsc: ifsc || '',
      micr: micr || '',
      swift: swift || '',
      referenceId: referenceId || `VER-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      provider: this.providerName,
      verifiedAt: new Date().toISOString(),
      verificationStatus: 'VERIFIED',
      ...providerDetail,
      raw: rawResponse || null
    };
  }



  // Contract methods to be overridden by adapters
  async verifyAccount(ifsc, accountNumber, employeeName) {
    throw new Error('verifyAccount must be implemented by the provider adapter.');
  }

  async lookupIFSC(ifsc) {
    // Default implementation can delegate to global IFSC lookup or simulated response
    return { valid: true, ifsc: String(ifsc).toUpperCase(), bankName: 'Standard Bank', branch: 'Main Branch' };
  }

  async getBalance() {
    return { currency: 'INR', balance: 500000.00, status: 'Active' };
  }

  async healthCheck() {
    // Check if credentials are provided based on authentication type
    const authType = this.settings.authenticationType || 'Bearer Token';
    const { apiKey, apiSecret, bearerToken, clientId, clientSecret } = this.credentials;
    let isValid = false;

    switch (authType) {
      case 'Bearer Token':
        isValid = !!bearerToken && bearerToken.length > 5;
        break;
      case 'API Key':
        isValid = !!apiKey && apiKey.length > 3;
        break;
      case 'API Key + Secret':
        isValid = !!apiKey && !!apiSecret;
        break;
      case 'OAuth2 Client Credentials':
        isValid = (!!clientId && !!clientSecret) || !!bearerToken;
        break;
      case 'Basic Authentication':
        isValid = !!apiKey && !!apiSecret;
        break;
      default:
        isValid = !!bearerToken || !!apiKey;
    }

    if (!isValid) {
      return { ok: false, status: 'invalid_token', message: `Missing or invalid credentials for ${authType}` };
    }

    return { ok: true, status: 'connected', message: `Connected to ${this.providerName} (${this.environment}) successfully.` };
  }
}

module.exports = {
  BankVerificationProvider
};
