// ===========================================================================
//  Audit actor context (AsyncLocalStorage).
//
//  Carries the authenticated user through the async call chain so the Prisma
//  audit middleware (which runs deep inside controllers, with no req access)
//  can record WHO performed each create/update/delete. An early Express
//  middleware opens the context per request; the auth middleware fills in the
//  user once the token is verified.
// ===========================================================================
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

module.exports = {
  // Open a fresh context for a request and run the rest of the chain inside it.
  run(callback) {
    als.run({ user: null }, callback);
  },
  // Attach the authenticated user to the current request's context.
  setUser(user) {
    const store = als.getStore();
    if (store) store.user = user;
  },
  // Read the current actor (null when unauthenticated / outside a request).
  getUser() {
    const store = als.getStore();
    return store ? store.user : null;
  },
};
