// First-visit tutorial text, kept as plain data (rule 11). The tutorial engine and A step with a `permission` is shown only to roles that have it.
export const TOURS = {
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
        text: "Search by name, phone or email, or filter by status and balance to see who owes money or has store credit.",
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
        text: "The top cards show what this customer owes you (or the store credit they hold), how much they have spent after refunds, and when they last bought.",
      },
      {
        title: "Debt and credit history",
        text: "Below the cards is every change to their balance, newest first. The Reference column links to the sale or return behind each change.",
      },
      {
        title: "Their sales",
        text: "Choose View sales to see every sale made to this customer in the Sales list.",
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
        text: "Search by sale number or customer, narrow by date, or switch on Money still owed to see sales that have not been fully paid.",
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
        text: "The receipt is shown in the middle of the page. It is called an invoice while some of the money is still owed, and a receipt once everything is paid.",
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
};
