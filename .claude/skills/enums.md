# Enum Values — Expense Tracker

## Categories (50)
Zepto/Blinkit, Credit Card Payment, Doctor, Donation, Entertainment, Fitness,
Fruits & Veggies, Furlenco, Gifts, Home stuff, House Help, Investment, Laundry,
Loan EMI, Medicines, Monthly Home bills, Ola/Uber, Others, Outside Food, Parking,
Petrol, Porter/Rapido, Refunded, Rent, Salon, Settlement,
Shopping - bag, Shopping - clothes, Shopping - electronics, Shopping - gold,
Shopping - home, Shopping - jwellery, Shopping - shoes, Shopping - silver,
Shopping - skin+hair care, Shopping - hobby,
Subscriptions, Unexpected, Wifi/ Phone bills, Insurance, Travel - flights,
Car downpayment/ emi, Therapy, Birthday gift, Stays, Nutritionist, Books,
Flowers, ESOPS, Movies, DryClear

**Excluded from expense totals (CC_EXCLUDE):**
- `Credit Card Payment` — bill payment, not an expense
- `Settlement` — handled via expense_type, not category spend

## Expense Types
| Value | Meaning |
|---|---|
| `Pooja_Personal` | Pooja's own expense |
| `Kunal_Personal` | Kunal's own expense |
| `Common_50_50` | Split equally |
| `Pooja_for_Kunal` | Pooja paid, Kunal owes |
| `Kunal_for_Pooja` | Kunal paid, Pooja owes |
| `Pooja_CreditCard_Bill` | CC bill payment by Pooja |
| `Kunal_CreditCard_Bill` | CC bill payment by Kunal |

## Payment Methods
Cash, ICICI_Credit_Card, Amazon_Credit_Card, SBI_Credit_Card, HDFC_Credit_Card,
ABFL_Credit_Card, HDFC_Debit_Card, Zaggle

## Paid By
Pooja, Kunal

## Month format
`"March_2026"` — always `{MonthName}_{Year}`, derived from `date` at insert time.
Never store or sort alphabetically — use `MONTH_SORT` CASE expression.
