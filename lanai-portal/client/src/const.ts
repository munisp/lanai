export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const redirectUri = `${window.location.origin}/api/oauth/callback`;

  const kcUrl = import.meta.env.VITE_KEYCLOAK_URL;
  const kcRealm = import.meta.env.VITE_KEYCLOAK_REALM;
  const kcClient = import.meta.env.VITE_KEYCLOAK_CLIENT_ID;

  if (kcUrl && kcRealm && kcClient) {
    // Keycloak OIDC authorization-code flow.
    const url = new URL(
      `${kcUrl.replace(/\/+$/, "")}/realms/${kcRealm}/protocol/openid-connect/auth`
    );
    url.searchParams.set("client_id", kcClient);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "openid profile email");
    url.searchParams.set("state", btoa(redirectUri));
    return url.toString();
  }

  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID ?? "lanai-portal";
  const state = btoa(redirectUri);

  if (!oauthPortalUrl) {
    // OAuth portal URL not configured — fall back to the dev login bypass so
    // the full stack can be explored without a live identity provider.
    console.warn("[auth] VITE_OAUTH_PORTAL_URL is not set; using dev login.");
    return `${window.location.origin}/api/oauth/dev-login`;
  }

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
