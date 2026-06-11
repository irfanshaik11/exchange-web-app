# Onramper Integration - Migration from MoonPay

## Summary
Successfully replaced MoonPay with Onramper as the fiat onramp provider.

## Changes Made
### 1. DepositModal.tsx (`/src/components/DepositModal.tsx`)

#### Removed:
- MoonPay SDK script loading
- `moonPayLoaded` state variable
- `window.MoonPayWebSdk` interface declaration
- `showMoonPay()` function with MoonPay SDK initialization

#### Added:
- Onramper integration using widget URL approach
- API key loaded from `NEXT_PUBLIC_ONRAMPER_API_KEY` env var (publishable `pk_` key — safe to ship to client but must be configured per environment)
- `showOnramper()` function that opens Onramper widget in popup window
- `buildOnramperUrl(walletAddress)` helper that constructs the widget URL with the user's primary wallet as the destination

#### Updated UI:
- Changed badge color from purple (`#7D00FF`) to green (`#18c48c`)
- Updated badge text from "MoonPay" to "Onramper"
- Changed button text to "Buy {token} with Onramper"
- Updated button color to match Onramper branding
- Changed footer text to "Powered by Onramper"
- Updated support link to `https://onramper.com/help/`

### 2. package.json
- Removed dependency: `"@moonpay/moonpay-js": "^0.7.6"`
- Ran `npm install` to clean up node_modules

## Onramper Widget Configuration

The integration uses Onramper's widget URL. The key and destination wallet are dynamic; theme params are static. See `buildOnramperUrl(walletAddress)` in `src/components/DepositModal.tsx` for the single source of truth. Pseudocode:

```javascript
const onramperUrl = new URL('https://buy.onramper.com/');
onramperUrl.searchParams.set('apiKey', process.env.NEXT_PUBLIC_ONRAMPER_API_KEY);
onramperUrl.searchParams.set('wallets', `sol:${primaryWalletAddress}`);
// ...theme params (defaultCrypto, defaultAmount, themeName, colors)
```

## Widget Display Method

The widget opens in a centered popup window with dimensions:
- Width: 500px
- Height: 700px
- Features: Resizable and scrollable

## Benefits of Onramper

1. **No SDK dependency** - Uses direct widget URL, reducing bundle size
2. **Customizable theming** - Matches your app's dark theme
3. **Multi-provider support** - Onramper aggregates multiple on-ramp providers
4. **Simple integration** - No complex SDK initialization required

## Testing Checklist

- [ ] Test buy flow with valid wallet address
- [ ] Verify wallet address is correctly passed to Onramper
- [ ] Check that popup window opens correctly
- [ ] Verify theme colors match the app design
- [ ] Test error handling when no wallet address is available
- [ ] Verify "Buy" tab displays correct branding

## API Key

The Onramper publishable API key is configured per environment via the `NEXT_PUBLIC_ONRAMPER_API_KEY` env var. Do **not** commit real keys into source — rotate through the Onramper dashboard and update the per-environment env files.

## Support

For Onramper support and documentation:
- Help Center: https://onramper.com/help/
- Documentation: https://docs.onramper.com/

