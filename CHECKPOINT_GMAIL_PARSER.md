# Gmail Parser Checkpoint - 2026-01-18

## Branch
```
claude/review-root-document-n6pY9
```

## Main File
```
apps/web/app/api/gmail/scan/route.ts
```

## Current Status

### WORKING (7 flights detected):
| Flight | Route | Date | Source |
|--------|-------|------|--------|
| FR5531 | Milan → Cologne | 04/09/2024 | Ryanair (forwarded) |
| FR5550 | Cologne → Milan | 09/09/2024 | Ryanair (forwarded) |
| PC1214 | Милан → Стамбул | 17/11/2024 | Trip.com |
| PC396 | Стамбул → Санкт-Петербург | 18/11/2024 | Trip.com |
| PC397 | Санкт-Петербург → Стамбул | 25/11/2024 | Trip.com |
| PC1211 | Стамбул → Милан | 26/11/2024 | Trip.com |
| PG184 | Ко Самуи → Бангкок | 25/03/2025 | Trip.com |

### NOT WORKING:
1. **EasyJet direct emails** - "Your booking K7G7F5N: Oleg, it's nearly time to fly to Milan"
   - Flight: EJU3756 / U23756 (Barcelona → Milan)
   - Flight: U27669 (Lisbon → Milan)
   - Problem: Emails not appearing in logs at all (even with debug logging added)
   - Date format: "Sun 09 Jun" (no year) - parsing logic added but not tested

2. **Pegasus direct emails** - "Online Ticket Reservation from Pegasus Airlines"
   - Flights: PC399, PC1211 (St.Petersburg → Istanbul → Milan)
   - Problem: May not be found by Gmail query

## Architecture (3-Level Parsing)

```
Level 1: Gmail API Filter (AIRLINE_DOMAINS + OTA_DOMAINS + CONTENT_PATTERNS)
    ↓
Level 2: JSON-LD Parsing (schema.org FlightReservation)
    ↓
Level 3: Regex Fallback (flight numbers, routes, dates in context window)
```

## Key Fixes Made This Session

1. **Dates without year** - Added pattern for "Sun 09 Jun" format, infers year from email date header
2. **Trip.com connecting flights** - Routes now matched by date (routesByDate Map)
3. **Russian abbreviated months** - Added "нояб.", "янв." etc. to MONTH_TO_NUM
4. **2-digit years** - "24" → "2024" conversion
5. **More email domains** - Added ryanairmail.com, info.easyjet.com, mailing.flypgs.com
6. **Debug logging** - Added for EasyJet emails to diagnose why they're not detected

## Next Steps

1. **Run scan and check logs** - The debug logging will show EasyJet emails even if no flights detected
2. **Analyze why EasyJet emails aren't found** - Either:
   - Gmail query not returning them
   - Flight number format different in EasyJet emails
3. **Check Pegasus direct emails** - Similar investigation needed

## Instructions for New Session

```
1. Checkout branch: git checkout claude/review-root-document-n6pY9
2. Read main file: apps/web/app/api/gmail/scan/route.ts
3. User will share new logs after scanning
4. Look for "[DEBUG] EasyJet email but no flights detected!" in logs
5. If no EasyJet emails in logs at all - problem is Gmail query
6. If EasyJet in logs but no flights - problem is parsing patterns
```

## User's Email Examples

**EasyJet format:**
- Subject: "Your booking K7G7F5N: Oleg, it's nearly time to fly to Milan"
- Date in email: "Sun 09 Jun" (no year!)
- Flight: EJU3756 or U23756

**Pegasus format:**
- Subject: "Online Ticket Reservation from Pegasus Airlines"
- Flight: PC399

## Key Code Sections

- Lines 10-18: AIRLINE_DOMAINS
- Lines 25-31: CONTENT_PATTERNS
- Lines 181-202: PATTERNS (date regex)
- Lines 204-214: MONTH_TO_NUM
- Lines 216-508: parseWithRegex() - main parsing logic
- Lines 269-284: Trip.com route-by-date matching
- Lines 587-606: Debug logging for EasyJet
