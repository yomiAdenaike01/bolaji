// src/routes/faqs.route.ts or similar

export const FAQS = [
  {
    category: "Preorders",
    items: [
      {
        q: "What does it mean to preorder an edition?",
        a: "Preordering guarantees your copy before the edition is released. Physical and full editions are limited — once sold out, they won’t be restocked.",
      },
      {
        q: "When will Edition 00 be available?",
        a: "Edition 00 releases on November 9th. Digital access will begin from that date, and physical copies will ship shortly after.",
      },
      {
        q: "Can I preorder multiple copies?",
        a: "Yes. You can only order one digital or full edition while stock lasts (300 copies total).",
      },
      {
        q: "What happens after I preorder?",
        a: "You’ll receive a confirmation email and your private access password. You’ll be notified again when your edition becomes available.",
      },
    ],
  },
  {
    category: "Subscriptions",
    items: [
      {
        q: "How do subscriptions work?",
        a: "Subscriptions give you access to each new edition as they’re released. When you start, you’ll unlock the earliest available edition and continue unlocking one edition per billing cycle.",
      },
      {
        q: "Does my subscription include Edition 00?",
        a: "Subscriptions start from Edition 1 onward — Edition 00 is preorder-only.",
      },
      {
        q: "What happens if I pause or cancel my subscription?",
        a: "Your access to any unlocked editions remains until their access period expires. You can resume anytime to continue unlocking new editions.",
      },
    ],
  },
  {
    category: "Shipping",
    items: [
      {
        q: "When will physical editions ship?",
        a: "Shipping begins shortly after the release date. You’ll receive an email once your copy has been dispatched.",
      },
      {
        q: "Do I need to enter my address every time?",
        a: "No. Once your address is saved during checkout, it’s stored securely for future orders.",
      },
    ],
  },
  {
    category: "Payments",
    items: [
      {
        q: "What payment methods do you accept?",
        a: "We accept major cards, Google Pay, and (where supported) Apple Pay.",
      },
      {
        q: "Will I be charged immediately when I preorder?",
        a: "Yes, payment is processed at the time of preorder to secure your copy.",
      },
    ],
  },
];
