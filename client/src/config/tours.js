// First-visit tutorial text, kept as plain data (rule 11). The tutorial engine and
// the Guide page arrive in Step 13; each step from 7 on only adds its pages here.
// A step with a `permission` is shown only to roles that have it.
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
        text: "The top cards show what this customer owes you (or the store credit they hold), how much they have spent and when they last bought.",
      },
      {
        title: "Debt and credit history",
        text: "Below the cards is every change to their balance, newest first, so you can see how it got to where it is.",
      },
      {
        title: "Edit or deactivate",
        text: "Use Edit to correct contact details or notes. Deactivate hides the customer from new sales but keeps their records.",
        permission: "customers.write",
      },
    ],
  },
};
