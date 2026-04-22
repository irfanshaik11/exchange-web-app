<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into this Next.js Pages Router project. PostHog is initialized via `instrumentation-client.ts` (Next.js 15.3+ pattern) with a reverse proxy through `/ingest/*` rewrites in `next.config.js`. Environment variables are set in `.env.local`. Thirteen events covering the full trading lifecycle — from user acquisition through buy/sell execution — have been added across eight files, plus `posthog.identify()` calls on email login/signup to correlate user identity. Exception capture (`posthog.captureException`) was added on critical error paths in `LoginModal.tsx` and `TradeActionPanel.tsx`.

| Event | Description | File |
|---|---|---|
| `user_signed_up` | User completes registration via email | `src/components/LoginModal.tsx` |
| `user_logged_in` | User logs in via email/password or wallet | `src/components/LoginModal.tsx` |
| `wallet_connected` | New user connects a Solana/EVM wallet | `src/components/LoginModal.tsx` |
| `token_buy_submitted` | User submits a buy order (market trade) | `src/components/trade/TradeActionPanel.tsx` |
| `token_sell_submitted` | User submits a sell from the trade panel | `src/components/trade/TradeActionPanel.tsx` |
| `limit_order_created` | User creates a limit order | `src/components/trade/TradeActionPanel.tsx` |
| `quick_sell_submitted` | User sells from the portfolio quick-sell popup | `src/components/SellPopup.tsx` |
| `referral_link_copied` | User copies their referral link | `src/pages/rewards.tsx` |
| `referral_link_copied` | User copies their referral link | `src/pages/referrals.tsx` |
| `wallet_import_initiated` | User opens the import wallet modal | `src/pages/portfolio.tsx` |
| `wallet_export_initiated` | User opens the export wallet modal | `src/pages/portfolio.tsx` |
| `pulse_tab_switched` | User switches between NEW / FINAL STRETCH / MIGRATED tabs | `src/pages/pulse.tsx` |
| `leaderboard_category_changed` | User switches leaderboard category or season | `src/pages/leaderboard.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/393294/dashboard/1499224
- **Trading Funnel: Pulse → Buy** (conversion funnel): https://us.posthog.com/project/393294/insights/DFxz1RWG
- **Daily Trading Activity** (buys + sells over time): https://us.posthog.com/project/393294/insights/7uQUb9rl
- **User Signups & Logins** (acquisition trend): https://us.posthog.com/project/393294/insights/1EB8ILr9
- **Referral Link Copies** (virality): https://us.posthog.com/project/393294/insights/8g0iOSQh
- **Limit Orders Created** (advanced feature adoption): https://us.posthog.com/project/393294/insights/r2WmVstA

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
