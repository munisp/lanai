export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Starts the server-managed Keycloak Authorization Code + PKCE flow. The server
 * owns the client secret, state transaction, and callback validation; the browser
 * supplies only a same-origin return path.
 */
export const getLoginUrl = () => {
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `/api/oauth/login?returnTo=${encodeURIComponent(returnTo.startsWith("/") ? returnTo : "/")}`;
};
