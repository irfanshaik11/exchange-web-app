import posthog from "posthog-js";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
if (token) {
  const isProduction = process.env.NODE_ENV === "production";
  posthog.init(token, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    // `defaults: "2026-01-30"` auto-flags localhost visitors as internal/test
    // users, which hides every local dev event from the default PostHog
    // dashboard view. Override only in non-production so real users are
    // never flagged as test users in prod.
    ...(isProduction ? {} : { internal_or_test_user_hostname: undefined }),
    capture_exceptions: true,
    session_recording: {
      maskAllInputs: true,
      maskInputOptions: { password: true },
    },
    debug: !isProduction,
  });
}
