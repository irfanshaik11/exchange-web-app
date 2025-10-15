# Debugging Token Analytics Integration

## 🔍 Current Changes

I've updated the code to:
1. ✅ Handle 500 errors gracefully (show "0%" instead of crashing)
2. ✅ Log API errors to console
3. ✅ Log all data received from API
4. ✅ Log each metric value being displayed

## 🧪 How to Debug

### Step 1: Open Browser Console
Press `F12` and go to the Console tab

### Step 2: Refresh Pulse Page
Navigate to `http://localhost:3000/pulse` and refresh

### Step 3: Look for Console Logs

You should see logs like:
```
SolanaTokenAnalytics data for 2Rz2XhW1: { sniper_holding_percentage: 0, ... }
Sniper for 2Rz2XhW1: 0
Insider for 2Rz2XhW1: 0
Dev for 2Rz2XhW1: 0
```

### Step 4: Check for API Errors

If you see:
```
API Error: { error: "some message" }
```

This shows what's causing the 500 errors.

---

## 🔧 Testing Individual Token

### Test in Browser Console:

```javascript
// Test the hook directly
fetch('http://localhost:4000/tokens', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mint: '2Rz2XhW1HTRXjVEi1d4svqvK2K7DkZ3wNMWTVb2agray' })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);

// Then get metrics
fetch('http://localhost:4000/tokens/2Rz2XhW1HTRXjVEi1d4svqvK2K7DkZ3wNMWTVb2agray/metrics?refresh=false')
.then(r => r.json())
.then(data => {
  console.log('Holders:', data.metrics.total_holders_count);
  console.log('Whale %:', data.metrics.whale_holding_percentage);
  console.log('Sniper %:', data.metrics.sniper_holding_percentage);
  console.log('Dev %:', data.metrics.dev_holding_percentage);
  console.log('Insider %:', data.metrics.insider_holding_percentage);
})
.catch(console.error);
```

---

## 📊 Expected Behavior

### If Token Has Data:
- Should see values > 0 for at least whale percentage
- Example: `Whale for 2Rz2XhW1: 99.99`
- Display should show: "99.9%" in red

### If Token Has NO Data:
- All values will be 0
- Display should show: "0%" in gray

### If API Error (500):
- Console will show: `API Error: { error: "..." }`
- Display should show: "0%" in gray (not crash)

---

## 🐛 Common Issues

### Issue 1: All Showing "0%"
**Cause:** Tokens haven't been populated with blockchain data yet
**Solution:** Run the population script:
```bash
cd /Users/__Hujoe__/Documents/interstate/token-analytics/token-analytics-fork-main
node populate-pulse-tokens.js
```

### Issue 2: HTTP 500 Errors
**Cause:** Backend error (database, validation, etc.)
**Debug:** 
1. Check console for "API Error:" logs
2. Check Token Analytics terminal for error stack traces
3. Test API directly with curl

### Issue 3: Values Not Displaying
**Cause:** Component not rendering value
**Debug:**
1. Check console for metric value logs
2. If values are logged but not shown, check CSS/styling
3. Verify the span/text element is not hidden

---

## ✅ Success Checklist

Check console logs:
- [ ] "SolanaTokenAnalytics data for..." - shows data object
- [ ] "Sniper for...: X" - shows actual number
- [ ] "Insider for...: X" - shows actual number
- [ ] "Dev for...: X" - shows actual number
- [ ] No "API Error" messages (or they're for different tokens)

Check display:
- [ ] Loading spinner appears briefly
- [ ] Then shows a percentage value (even if "0%")
- [ ] Color is correct (gray for 0%, green/yellow/red for values)
- [ ] No React errors in console

---

## 🎯 Quick Test Commands

### Test API is Working:
```bash
curl http://localhost:4000/health
# Should return: {"ok":true,"env":"development"}
```

### Test Token Registration:
```bash
curl -X POST http://localhost:4000/tokens \
  -H "Content-Type: application/json" \
  -d '{"mint":"2Rz2XhW1HTRXjVEi1d4svqvK2K7DkZ3wNMWTVb2agray"}'
# Should return: {"token":{...}}
```

### Test Metrics Fetch:
```bash
curl "http://localhost:4000/tokens/2Rz2XhW1HTRXjVEi1d4svqvK2K7DkZ3wNMWTVb2agray/metrics?refresh=false"
# Should return: {"mint":"...","metrics":{...}}
```

### Check if Token Has Data:
```bash
curl -s "http://localhost:4000/tokens/2Rz2XhW1HTRXjVEi1d4svqvK2K7DkZ3wNMWTVb2agray/metrics" | jq '.metrics.total_holders_count'
# Should return a number (20 if populated, 0 if not)
```

---

## 📝 What Should Happen

1. **Frontend loads Pulse page**
2. **For each token visible:**
   - Makes POST request to register token (may get 500 if already exists - that's OK)
   - Makes GET request for metrics
   - If successful: displays percentages
   - If error: displays "0%"
3. **Console shows:**
   - Data objects received
   - Metric values being displayed
   - Any API errors

4. **Display shows:**
   - Loading spinner (briefly)
   - Then percentage values
   - Color-coded based on risk

---

## 🚀 Next Steps

1. **Refresh your browser** with console open
2. **Look for the console logs** - they'll tell you exactly what's happening
3. **Share the console output** if you're still seeing issues
4. **Check if values appear** even if they're all "0%"

The debug logs will show us exactly what data is coming from the API and what's being displayed!


