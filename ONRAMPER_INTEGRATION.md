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
- `ONRAMPER_API_KEY` constant: `pk_prod_01KB0GV0SYGKAC64C5QRJPD5DZ`
- `showOnramper()` function that opens Onramper widget in popup window

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

The integration uses Onramper's widget URL with the following parameters:

```javascript
const onramperUrl = new URL('https://widget.onramper.com');
onramperUrl.searchParams.set('apiKey', ONRAMPER_API_KEY);
onramperUrl.searchParams.set('wallets', `SOL:${depositAddress}`);
onramperUrl.searchParams.set('defaultCrypto', 'SOL');
onramperUrl.searchParams.set('defaultAmount', '100');
onramperUrl.searchParams.set('themeName', 'dark');
onramperUrl.searchParams.set('containerColor', '1a1b20');
onramperUrl.searchParams.set('primaryColor', '18c48c');
onramperUrl.searchParams.set('secondaryColor', '2A2D35');
onramperUrl.searchParams.set('cardColor', '0a0b0f');
onramperUrl.searchParams.set('primaryTextColor', 'ffffff');
onramperUrl.searchParams.set('secondaryTextColor', 'E6E7EA');
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

Production API Key: `pk_prod_01KB0GV0SYGKAC64C5QRJPD5DZ`

## Support

For Onramper support and documentation:
- Help Center: https://onramper.com/help/
- Documentation: https://docs.onramper.com/

