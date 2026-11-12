// First-visit tutorial text, kept as plain data (rule 11). The tutorial engine and A step with a `permission` is shown only to roles that have it.
export const TOURS = {
  "add-business": {
    title: "Add another business",
    steps: [
      {
        title: "A separate business",
        text: "Each business has its own products, sales, customers, staff and settings. Nothing is shared between your businesses.",
      },
      {
        title: "You are the owner",
        text: "You become the owner of the new business and can do everything in it. Your role in your other businesses does not change.",
      },
      {
        title: "Switching",
        text: "Use the business menu at the top of the sidebar to move between your businesses. Each one opens on its Overview.",
      },
    ],
  },
  overview: {
    title: "Overview",
    steps: [
      {
        title: "Your business at a glance",
        text: "The cards at the top show revenue, expenses, profit and orders for the month you picked. Use the month menu at the top to look at another month.",
      },
      {
        title: "Sales over time",
        text: "The chart shows how your sales moved. Use Weekly, Monthly or Daily to zoom in or out.",
      },
      {
        title: "Needs attention",
        text: "A short list of things worth a look next, such as low stock or products that are selling less. Each one links to the page where you can act on it.",
      },
    ],
  },
  products: {
    title: "Products",
    steps: [
      {
        title: "Your product catalogue",
        text: "Every product you sell is listed here. A product stays in the catalogue even when its stock reaches zero.",
      },
      {
        title: "Add a product",
        text: "Choose Add product to save a name, SKU, category, prices, minimum stock level and a picture.",
        permission: "products.write",
      },
      {
        title: "Add many at once",
        text: "Import products adds or updates many products from one CSV file, after showing you what will change.",
        permission: "import.run",
      },
    ],
  },
  "product-form": {
    title: "A product",
    steps: [
      {
        title: "Name, SKU and category",
        text: "Give the product a clear name. A SKU (product code) and a category make it easier to find later.",
      },
      {
        title: "Prices and stock level",
        text: "The purchase price is what you pay for it and the selling price is what the customer pays. The minimum stock level is the number at which you want a low-stock warning.",
      },
      {
        title: "Picture and status",
        text: "Add a picture so the product is easy to spot. A product you no longer sell can be made inactive instead of deleted, and its history is kept.",
      },
    ],
  },
  inventory: {
    title: "Inventory",
    steps: [
      {
        title: "What you have in stock",
        text: "Each product is listed with the quantity you have now. Products at or below their minimum stock level are the ones to reorder.",
      },
      {
        title: "Every change is recorded",
        text: "Stock coming in, being sold, returned, damaged or counted again is saved as a stock movement, so you can always see why a number changed.",
      },
      {
        title: "Suppliers and orders",
        text: "Use the Suppliers page for the people you buy from, and Purchase orders to order and receive stock.",
        permission: "purchases.manage",
      },
    ],
  },
  suppliers: {
    title: "Suppliers",
    steps: [
      {
        title: "Who you buy from",
        text: "Your suppliers are listed here with their contact details.",
      },
      {
        title: "Add a supplier",
        text: "Choose Add supplier to save a new one. You can then pick them on products and on purchase orders.",
        permission: "suppliers.manage",
      },
    ],
  },
  customers: {
    title: "Customers",
    steps: [
      {
        title: "Your customer list",
        text: "Everyone you sell to is listed here, with their discount level, balance and last purchase. Click a name to open their profile.",
      },
      {
        title: "Add a customer",
        text: "Use Add customer to save a name and, if you have them, a phone number and email. Each phone number or email can belong to one customer only.",
        permission: "customers.write",
      },
      {
        title: "Find people quickly",
        text: "Search by name, phone or email, filter by status or balance, and click a column heading to sort. People who can view reports also get an Export CSV button that downloads exactly the list you are looking at.",
      },
      {
        title: "Deactivate, don't delete",
        text: "Customers who stop buying can be deactivated. Their history is kept and you can bring them back any time with Reactivate.",
        permission: "customers.write",
      },
    ],
  },
  "customer-profile": {
    title: "Customer profile",
    steps: [
      {
        title: "Balance and purchases",
        text: "The top cards show what this customer owes you (or the store credit they hold), how much they have spent after refunds, and when they last bought. Choose View sales to see every sale made to them.",
      },
      {
        title: "Debt and credit history",
        text: "Below the cards is every change to their balance, newest first, including payments with their method and reference. The Reference column links to the sale or return behind each change.",
      },
      {
        title: "Record a payment",
        text: "When a customer pays what they owe, choose Record payment. The app shows which sales it settles, oldest first, and anything extra is kept as store credit. Managers can also use Adjust balance for corrections, with a reason.",
        permission: "customers.write",
      },
      {
        title: "Edit or deactivate",
        text: "Use Edit to correct contact details or notes. Deactivate hides the customer from new sales but keeps their records.",
        permission: "customers.write",
      },
    ],
  },
  discounts: {
    title: "Discounts",
    steps: [
      {
        title: "Promo codes",
        text: "A promo code takes a percentage or a fixed amount off a whole sale. Your team types the code when recording a sale, and the price updates straight away.",
      },
      {
        title: "Add a promo",
        text: "Choose Add promo, give it a name and a code, then set the amount off. You can also add a minimum order, start and end dates, and a limit on how many times it can be used.",
      },
      {
        title: "One discount at a time",
        text: "Discounts never add up. If a customer already has a discount level, the sale uses whichever is larger, the promo or the customer's level.",
      },
      {
        title: "Turn off, don't delete",
        text: "Turn a promo off when you are done with it. Past sales keep their record, and you can turn it back on any time.",
      },
    ],
  },

  sales: {
    title: "Sales",
    steps: [
      {
        title: "Every sale in one place",
        text: "Each sale appears here with its number, customer, total and whether anything is still owed. Click a sale number to open it and see the receipt.",
      },
      {
        title: "Record a sale",
        text: "Choose New sale to pick products, add a customer if you know who is buying, and take payment. Walk-in customers pay in full; saved customers can leave part of it on credit.",
        permission: "sales.create",
      },
      {
        title: "Find a sale",
        text: "Search by sale number or customer, narrow by date, switch on Money still owed, and click Sale, Total or Payment to sort. People who can view reports also get Export CSV for the sales shown.",
      },
      {
        title: "Voided and returned sales",
        text: "A sale that was cancelled shows as Voided and a sale with returned goods shows how many returns it has. Open the sale to see the details.",
      },
    ],
  },
  "new-sale": {
    title: "Recording a sale",
    steps: [
      {
        title: "Add products",
        text: "Search by name or SKU, or scan a barcode, then click a product to add it. Click it again to add one more, or type a quantity in the cart.",
      },
      {
        title: "Customer and discounts",
        text: "Sales default to a walk-in customer. Search for a saved customer to apply their discount level or to sell on credit. A promo code can be typed in too, and only one discount applies to a sale.",
      },
      {
        title: "Manual discount",
        text: "Managers can tick Give a manual discount to enter a percentage or a fixed amount that replaces the automatic discounts.",
        permission: "discounts.manage",
      },
      {
        title: "Take payment",
        text: "Use Pay in full, or split the amount across methods. For a saved customer, whatever is not paid now is added to their balance as credit. Walk-in sales must be paid in full.",
      },
    ],
  },
  "sale-detail": {
    title: "A sale",
    steps: [
      {
        title: "The receipt",
        text: "The receipt is shown in the middle of the page. It is called an invoice while some of the money is still owed, and a receipt once everything is paid. When the customer pays later, use Record payment.",
      },
      {
        title: "Print or save as PDF",
        text: "Choose Print receipt. In the window that opens, pick a printer, or choose Save as PDF to keep a copy or send it to the customer.",
      },
      {
        title: "Returns",
        text: "When a customer brings goods back, choose Return items. Pick the quantities and say whether the goods are resellable or damaged. The refund is worked out for you.",
        permission: "sales.return",
      },
      {
        title: "Voiding a sale",
        text: "Void sale cancels a sale made by mistake and puts the products back in stock. A reason is required. A sale that already has returns cannot be voided.",
        permission: "sales.void",
      },
    ],
  },
  expenses: {
    title: "Expenses",
    steps: [
      {
        title: "Your spending in one place",
        text: "Every expense you record is listed here with its date, category and amount. The summary at the top adds up what you spent, in total and by category, for the dates you are looking at.",
      },
      {
        title: "Record an expense",
        text: "Choose Add expense, pick a category, then enter the amount and the date. You can also add who you paid, a note, and a photo or PDF of the receipt.",
        permission: "expenses.manage",
      },
      {
        title: "Find an expense",
        text: "Search by description, vendor or category, narrow by dates, pick one category, and click Date or Amount to sort. People who can view reports also get Export CSV for the expenses shown.",
      },
      {
        title: "Void, don't delete",
        text: "An expense entered by mistake can be voided, with a reason. It stays in the list as Voided, it is left out of every total, and it can no longer be edited.",
        permission: "expenses.manage",
      },
    ],
  },
  "expense-categories": {
    title: "Expense categories",
    steps: [
      {
        title: "Sorting your spending",
        text: "Categories group your expenses, like Rent or Electricity. A starter set was added for you, and you can rename any of them.",
      },
      {
        title: "Add a category",
        text: "Choose Add category for anything else you spend on, such as Packaging or Fuel. Two categories cannot have the same name.",
        permission: "expenses.manage",
      },
      {
        title: "Deactivate, don't delete",
        text: "A category you no longer use can be deactivated. It disappears from the Add expense list, but old expenses keep it and still count in your totals. Reactivate it any time.",
        permission: "expenses.manage",
      },
    ],
  },
  "purchase-orders": {
    title: "Purchase orders",
    steps: [
      {
        title: "Your orders to suppliers",
        text: "Every order you place with a supplier is listed here with its status: Draft, Ordered, Partly received, Received or Cancelled. Click an order number to open it.",
      },
      {
        title: "Create an order",
        text: "Choose New purchase order, pick the supplier and the products you want, and set the cost you expect to pay. You can save it as a draft or place it straight away.",
      },
      {
        title: "Find an order",
        text: "Search by order number or supplier, narrow by status, supplier or dates, and sort by the date a delivery is expected. Late deliveries are marked Overdue.",
      },
    ],
  },
  "new-purchase-order": {
    title: "A purchase order",
    steps: [
      {
        title: "Supplier and products",
        text: "Choose the supplier, then search for products and click one to add it. Each product starts at its current cost price, and you can change the cost and quantity for this order.",
      },
      {
        title: "Delivery and shipping",
        text: "Add the date you expect the goods and any shipping cost. Shipping is added to the order total on its own and is not spread into product costs.",
      },
      {
        title: "Draft or place",
        text: "Save as draft to keep working on it later. Save and place order when it has been sent to the supplier. A placed order is locked, and you can receive stock against it.",
      },
    ],
  },
  "purchase-order-detail": {
    title: "A purchase order",
    steps: [
      {
        title: "Where the order stands",
        text: "The status shows whether the order is a draft, placed, partly received or finished, and the cards show how much has arrived. Every delivery is listed at the bottom.",
      },
      {
        title: "Receive stock",
        text: "When goods arrive, choose Receive stock and enter what came, all of it or just part. Your inventory goes up straight away, and you can enter the cost the supplier actually charged.",
      },
      {
        title: "Cancel, don't delete",
        text: "An order you no longer need can be cancelled, with a reason. It stays on record. Stock that already arrived stays in your inventory.",
      },
      {
        title: "Print",
        text: "Choose Print to get a clean copy of the order to send to the supplier, or save it as a PDF from the print window.",
      },
    ],
  },
  analytics: {
    title: "Analytics",
    steps: [
      {
        title: "Today and this month",
        text: "The top of the page shows today's numbers, then the month you picked. Today always means today, whatever month is selected.",
      },
      {
        title: "Performance over time",
        text: "The chart shows how the month moved. Use Daily, Weekly or Monthly to zoom in or out, and read the Insights beside it for what changed.",
      },
      {
        title: "Profit and spending",
        text: "Switch the chart between Revenue, Gross profit, Operating expenses and Net profit. In Product analytics you can also rank products by how much profit they make.",
        permission: "finance.view",
      },
      {
        title: "Products and customers",
        text: "Pick an Analysis from the dropdown to see best and worst sellers, falling sales, stock that is low or not selling, and the customers who spend most or have gone quiet.",
      },
    ],
  },
  reports: {
    title: "Reports",
    steps: [
      {
        title: "Pick a report",
        text: "Use the Report menu to choose sales by day, week or month, sales by product or customer, stock movements, customer balances, or a month-by-month or year-by-year summary.",
      },
      {
        title: "Choose your dates",
        text: "Pick a ready-made range like This month or Last 30 days, or choose Custom dates. Both the first and the last day are included, and a range can be up to three years. Customer balances and the monthly and yearly summary do not use these dates.",
      },
      {
        title: "Profit and spending",
        text: "Profit and loss and Expenses by category appear in the menu for people with finance access. They also unlock cost and profit columns in the sales reports.",
        permission: "finance.view",
      },
      {
        title: "Export or print",
        text: "Export CSV downloads the report you are looking at, ready for Excel. Print / Save as PDF prints it on white paper with its dates at the top. For wide reports, choose Landscape in the print window.",
      },
    ],
  },
  "import-products": {
    title: "Import products",
    steps: [
      {
        title: "Start from the template",
        text: "Download the template, or download your current products, and fill it in with Excel. Only the name column is required. Save the file as CSV UTF-8 and choose it here.",
      },
      {
        title: "Check before anything is saved",
        text: "After you choose a file, you see what will happen to every row: a new product, an update, no change, or an error with the reason. Nothing is saved until you press Import.",
      },
      {
        title: "How rows are matched",
        text: "A row whose sku already exists updates that product, and blank cells leave the old values alone. A new sku creates a product. Categories and suppliers are matched by name and created when missing.",
      },
      {
        title: "Opening stock and safe repeats",
        text: "The opening_stock column only counts for new products and is recorded as a stock movement. To change the stock of an existing product, use a stock adjustment. Importing the same file twice changes nothing the second time.",
      },
    ],
  },
  staff: {
    title: "Staff",
    steps: [
      {
        title: "Your team",
        text: "Everyone with access to this business is listed here with their role and status. You can change a role or suspend someone. Nobody is ever deleted, and their records stay.",
        permission: "staff.manage",
      },
      {
        title: "Invite someone",
        text: "Choose Invite someone, enter their email and pick a role. No email is sent: copy the link and send it yourself. They sign up or sign in with that same email, then open the link to join. Each link works once and expires.",
        permission: "staff.manage",
      },
      {
        title: "What each role can do",
        text: "Pick a role under Role permissions and tick what it is allowed to do, or restore the defaults. Admins always keep Manage staff and Manage settings. People who are already signed in see changes after a refresh.",
        permission: "staff.manage",
      },
      {
        title: "Handing over the business",
        text: "If you are the owner, Transfer ownership gives the business to an active admin and makes you an admin. You confirm by typing the business name.",
        permission: "staff.manage",
      },
    ],
  },
  settings: {
    title: "Settings",
    steps: [
      {
        title: "Business details",
        text: "Set your business name, contact details, currency, timezone and tax rate, and add your logo. Changing the currency changes the symbol shown; amounts you already recorded are not converted.",
        permission: "settings.manage",
      },
      {
        title: "Your profile",
        text: "Update your name, phone number and picture. Your sign-in email cannot be changed here.",
      },
      {
        title: "Change your password",
        text: "Enter your current password first, then choose a new one of at least 8 characters.",
      },
    ],
  },
  backups: {
    title: "Backups and exports",
    steps: [
      {
        title: "Open your data in Excel",
        text: "Download Products, Customers, Sales or Expenses as a spreadsheet file. Double-click the file to open it in Excel or Google Sheets.",
        permission: "backups.manage",
      },
      {
        title: "The full backup file",
        text: "The backup file is a complete copy for safekeeping. You cannot open it in Excel. If something goes wrong, a developer can use it to bring your data back, because restoring is not available in the app yet.",
        permission: "backups.manage",
      },
      {
        title: "Keep it safe",
        text: "Store downloaded files somewhere other than this computer. They do not include pictures, receipts, logos or sign-in accounts.",
        permission: "backups.manage",
      },
    ],
  },
  "audit-log": {
    title: "Audit log",
    steps: [
      {
        title: "Who did what",
        text: "Every important change is recorded here with who made it and when, newest first. Open it any time you need to know what happened.",
        permission: "audit.view",
      },
      {
        title: "Find an entry",
        text: "Pick dates, a person or an area, such as Staff, Sales or Products, to narrow the list. Clear filters brings everything back.",
        permission: "audit.view",
      },
      {
        title: "What is recorded",
        text: "Team and role changes, invitations, business settings, price changes, voided sales and expenses, returns, and stock and balance adjustments. Passwords and invitation links are never recorded.",
        permission: "audit.view",
      },
      {
        title: "Read-only, with export",
        text: "Entries cannot be edited or deleted by anyone. Export CSV downloads exactly the entries you are looking at, ready for Excel.",
        permission: "audit.view",
      },
    ],
  },
  "stock-movements": {
    title: "Stock movements",
    steps: [
      {
        title: "Every change to your stock",
        text: "Each time stock comes in, is sold, returned, damaged, removed or counted again, it is listed here with the balance afterwards.",
      },
      {
        title: "Find and sort",
        text: "Search by product, filter by type or dates, and click Product, Change or When to sort. People who can view reports also get Export CSV for the movements shown.",
      },
    ],
  },
};
