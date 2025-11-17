
// Require Azure-authenticated user
export function requireAzureLogin(req, res, next) {
  if (!req.authContext || !req.authContext.account) {
    // Not logged in → send them back to login page
    return res.redirect('/');
  }
  next();
}
