(async () => {
  await import('./crypto.test');
  await import('./password.test');
  await import('./authorizeRoles.test');
  await import('./alertModelService.test');
  await import('./authService.test');
})();
