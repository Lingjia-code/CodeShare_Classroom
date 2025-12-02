
// Require Azure-authenticated user
export function requireAzureLogin(req, res, next) {
  console.log('=== Auth Check ===');
  console.log('Has authContext:', !!req.authContext);
  console.log('Has account:', !!req.authContext?.account);
  console.log('Account details:', req.authContext?.account);

  if (!req.authContext || !req.authContext.account) {
    // Not logged in → send them back to login page
    console.log('Auth failed - redirecting to /');
    return res.redirect('/');
  }
  console.log('Auth passed - continuing');
  next();
}
