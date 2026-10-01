const ALLOWED_EMAILS = new Set([
  "23jameso@cheslynhay.windsoracademytrust.org.uk",
  "23bradyk@cheslynhay.windsoracademytrust.org.uk",
  "23taylorj@cheslynhay.windsoracademytrust.org.uk"
]);

async function signInOrCreateAccount(email, password) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!ALLOWED_EMAILS.has(normalizedEmail)) {
    throw new Error("This email is not authorised.");
  }

  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const signIn = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password
  });

  if (!signIn.error) {
    return signIn.data.user;
  }

  const signUp = await supabase.auth.signUp({
    email: normalizedEmail,
    password
  });

  if (signUp.error) {
    throw signUp.error;
  }

  return signUp.data.user;
}
