/**
 * IFSC lookup controller — delegates to bankController for unified cache and demo dictionary.
 */
const bankController = require('./bankController');

exports.lookup = bankController.getIfsc;
