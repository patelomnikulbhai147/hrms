/**
 * BankVerificationFactory
 * Instantiates and returns the appropriate bank verification provider adapter
 * based on the company's BYO API configuration settings.
 */

const RazorpayProvider = require('./RazorpayProvider');
const CashfreeProvider = require('./CashfreeProvider');
const DecentroProvider = require('./DecentroProvider');
const SignzyProvider = require('./SignzyProvider');
const SurePassProvider = require('./SurePassProvider');
const HyperVergeProvider = require('./HyperVergeProvider');
const SetuProvider = require('./SetuProvider');
const CustomProvider = require('./CustomProvider');


class BankVerificationFactory {
  static getProvider(settings = {}, credentials = {}) {
    const providerName = String(settings.provider || '').trim();
    const lower = providerName.toLowerCase();

    if (lower.includes('razorpay')) {
      return new RazorpayProvider(settings, credentials);
    } else if (lower.includes('cashfree')) {
      return new CashfreeProvider(settings, credentials);
    } else if (lower.includes('decentro')) {
      return new DecentroProvider(settings, credentials);
    } else if (lower.includes('signzy')) {
      return new SignzyProvider(settings, credentials);
    } else if (lower.includes('surepass')) {
      return new SurePassProvider(settings, credentials);
    } else if (lower.includes('hyperverge')) {
      return new HyperVergeProvider(settings, credentials);
    } else if (lower.includes('setu')) {
      return new SetuProvider(settings, credentials);
    } else {
      return new CustomProvider(settings, credentials);
    }
  }

  static getSupportedProviders() {
    return [
      'RazorpayX',
      'Cashfree',
      'Decentro',
      'Signzy',
      'SurePass',
      'HyperVerge',
      'Setu',
      'Custom Provider'
    ];
  }
}

module.exports = BankVerificationFactory;
