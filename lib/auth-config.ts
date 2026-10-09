/** Build-time sign-in availability. Public reads must not depend on a Privy app id. */
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
export const PRIVY_CONFIGURED = Boolean(PRIVY_APP_ID);
