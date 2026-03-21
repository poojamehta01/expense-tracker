// Run locally: node scripts/reimport_march.js
// Or on Fly: fly ssh console --command "node /app/scripts/reimport_march.js"
const db = require('../db');

const rows = [
  ["1 March 2026",9962,"rent","HDFC_Debit_Card","Pooja","Pooja_Personal","Rent","","",""],
  ["1 March 2026",588.82,"airtel wifi","Zaggle","Pooja","Common_50_50","Wifi/ Phone bills","","",""],
  ["1 March 2026",647.82,"airtel pooja mobile","Zaggle","Pooja","Pooja_Personal","Wifi/ Phone bills","","",""],
  ["1 March 2026",15460,"car emi","HDFC_Debit_Card","Pooja","Pooja_Personal","Car downpayment/ emi","","",""],
  ["1 March 2026",70,"lonaval chikki","HDFC_Debit_Card","Pooja","Common_50_50","Outside Food","","",""],
  ["1 March 2026",90,"lonaval chikki","HDFC_Debit_Card","Pooja","Common_50_50","Outside Food","","",""],
  ["1 March 2026",200,"maid","HDFC_Debit_Card","Pooja","Common_50_50","House Help","","",""],
  ["2 March 2026",1228,"dryfruits","HDFC_Debit_Card","Pooja","Common_50_50","Fruits & Veggies","","",""],
  ["2 March 2026",500,"veggies","HDFC_Debit_Card","Pooja","Common_50_50","Fruits & Veggies","","",""],
  ["2 March 2026",5300,"ghagra","HDFC_Debit_Card","Pooja","Pooja_Personal","Shopping - clothes","","",""],
  ["4 March 2026",1038,"yes madam","HDFC_Debit_Card","Pooja","Pooja_Personal","Salon","","",""],
  ["5 March 2026",358,"uber","HDFC_Debit_Card","Pooja","Pooja_Personal","Ola/Uber","","",""],
  ["5 March 2026",61,"uber","HDFC_Debit_Card","Pooja","Pooja_Personal","Ola/Uber","","",""],
  ["7 March 2026",568,"uber","HDFC_Debit_Card","Pooja","Pooja_Personal","Ola/Uber","","",""],
  ["5 March 2026",150,"uber","HDFC_Debit_Card","Pooja","Pooja_Personal","Ola/Uber","","",""],
  ["7 March 2026",194,"uber","HDFC_Debit_Card","Pooja","Pooja_Personal","Ola/Uber","","",""],
  ["7 March 2026",189,"uber","HDFC_Debit_Card","Pooja","Pooja_Personal","Ola/Uber","","",""],
  ["8 March 2026",400,"peru","HDFC_Debit_Card","Pooja","Common_50_50","Fruits & Veggies","","",""],
  ["8 March 2026",280,"thirdwave","HDFC_Debit_Card","Pooja","Pooja_Personal","Outside Food","","",""],
  ["8 March 2026",167.19,"thirdwave","HDFC_Debit_Card","Pooja","Pooja_Personal","Outside Food","","",""],
  ["8 March 2026",2695.02,"thirdwave","HDFC_Debit_Card","Pooja","Pooja_Personal","Shopping - clothes","","",""],
  ["8 March 2026",161,"Uber","HDFC_Debit_Card","Pooja","Pooja_Personal","Ola/Uber","","",""],
  ["8 March 2026",30,"panipuri","HDFC_Debit_Card","Pooja","Common_50_50","Outside Food","","",""],
  ["8 March 2026",159,"icecream","HDFC_Debit_Card","Pooja","Common_50_50","Outside Food","","",""],
  ["9 March 2026",55,"rapido","HDFC_Debit_Card","Pooja","Common_50_50","Porter/Rapido","","",""],
  ["9 March 2026",16000,"sofa","HDFC_Debit_Card","Pooja","Common_50_50","Shopping - home","","",""],
  ["9 March 2026",300,"sofa guys tips","HDFC_Debit_Card","Pooja","Common_50_50","House Help","","",""],
  ["10 March 2026",3900,"dentist","HDFC_Debit_Card","Pooja","Pooja_Personal","Doctor","","",""],
  ["10 March 2026",476,"medicnes","HDFC_Debit_Card","Pooja","Pooja_Personal","Medicines","","",""],
  ["10 March 2026",95,"fruits","HDFC_Debit_Card","Pooja","Common_50_50","Fruits & Veggies","","",""],
  ["10 March 2026",30,"fruits","HDFC_Debit_Card","Pooja","Common_50_50","Fruits & Veggies","","",""],
  ["10 March 2026",170,"fruits","HDFC_Debit_Card","Pooja","Common_50_50","Fruits & Veggies","","",""],
  ["10 March 2026",40,"fruits","HDFC_Debit_Card","Pooja","Common_50_50","Fruits & Veggies","","",""],
  ["10 March 2026",18,"icecream cone","HDFC_Debit_Card","Pooja","Common_50_50","Outside Food","","",""],
  ["15 March 2026",318,"Uber","HDFC_Debit_Card","Pooja","Pooja_Personal","Ola/Uber","","",""],
  ["15 March 2026",273,"Uber","HDFC_Debit_Card","Pooja","Pooja_Personal","Ola/Uber","","",""],
  ["15 March 2026",330,"fruits","HDFC_Debit_Card","Pooja","Common_50_50","Fruits & Veggies","","",""],
  ["15 March 2026",222,"fruits","HDFC_Debit_Card","Pooja","Common_50_50","Fruits & Veggies","","",""],
  ["15 March 2026",240,"dryClean","HDFC_Debit_Card","Pooja","Common_50_50","DryClear","","",""],
  ["16 March 2026",500,"cook-pending","HDFC_Debit_Card","Pooja","Common_50_50","House Help","","",""],
  ["18 March 2026",130,"fruits","HDFC_Debit_Card","Pooja","Common_50_50","Fruits & Veggies","","",""],
  ["20 March 2026",193,"medicnes","HDFC_Debit_Card","Pooja","Pooja_Personal","Medicines","","",""],
  ["6 March 2026",130,"audible","HDFC_Debit_Card","Pooja","Pooja_Personal","Subscriptions","","",""],
  ["1 March 2026",804,"pill organizer","Amazon_Credit_Card","Pooja","Pooja_Personal","Home stuff","","",""],
  ["1 March 2026",423,"nivea cream","Amazon_Credit_Card","Pooja","Common_50_50","Zepto/Blinkit","","",""],
  ["5 March 2026",1302,"zepto","Amazon_Credit_Card","Pooja","Common_50_50","Zepto/Blinkit","","",""],
  ["11 March 2026",204.17,"zomato","Amazon_Credit_Card","Pooja","Common_50_50","Outside Food","","",""],
  ["12 March 2026",165.88,"zomato","Amazon_Credit_Card","Pooja","Pooja_Personal","Outside Food","","",""],
  ["12 March 2026",167.02,"zomato","Amazon_Credit_Card","Pooja","Pooja_Personal","Outside Food","","",""],
  ["14 March 2026",1647,"wakefit pillow","Amazon_Credit_Card","Pooja","Common_50_50","Home stuff","","",""],
  ["15 March 2026",189,"pin","Amazon_Credit_Card","Pooja","Common_50_50","Home stuff","","",""],
  ["15 March 2026",998,"sofa cover","Amazon_Credit_Card","Pooja","Common_50_50","Home stuff","","",""],
  ["17 March 2026",1932,"harsh gift","Amazon_Credit_Card","Pooja","Pooja_Personal","Birthday gift","","",""],
  ["17 March 2026",571.24,"harsh cupcakes","Amazon_Credit_Card","Pooja","Pooja_Personal","Birthday gift","","",""],
  ["17 March 2026",154.86,"harsh cupcakes","Amazon_Credit_Card","Pooja","Pooja_Personal","Outside Food","","",""],
  ["19 March 2026",438.55,"hair care","Amazon_Credit_Card","Pooja","Pooja_Personal","Shopping - skin/hair care","","",""],
];

const del = db.prepare("DELETE FROM transactions WHERE month = 'March_2026'");
const ins = db.prepare(`
  INSERT INTO transactions (date, amount, description, payment_method, paid_by, expense_type, category, mood, impulse, remarks, month)
  VALUES (@date, @amount, @description, @payment_method, @paid_by, @expense_type, @category, @mood, @impulse, @remarks, @month)
`);

const run = db.transaction(() => {
  const deleted = del.run();
  console.log(`Deleted ${deleted.changes} March_2026 rows`);
  for (const r of rows) {
    ins.run({
      date: r[0], amount: r[1], description: r[2].trim(),
      payment_method: r[3], paid_by: r[4], expense_type: r[5],
      category: r[6].trim(), mood: r[7], impulse: r[8], remarks: r[9],
      month: 'March_2026'
    });
  }
  console.log(`Inserted ${rows.length} rows`);
});

run();
console.log('Done.');
process.exit(0);
