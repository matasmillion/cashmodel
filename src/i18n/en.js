// English dictionary for the vendor portal and any external surface.
// Keys are nested by route per CLAUDE.md i18n rules. Add new strings here
// AND in zh-CN.js — never let the two diverge.

const en = {
  locale: {
    name: 'English',
    short: 'EN',
  },
  vendor: {
    common: {
      brand: 'Foreign Resource',
      portal: 'Vendor Portal',
      signOut: 'Sign out',
      language: 'Language',
      loading: 'Loading…',
      empty: 'Nothing here yet.',
      back: 'Back',
      acknowledge: 'Acknowledge',
      acknowledged: 'Acknowledged',
      pending: 'Pending',
      open: 'Open',
      submitted: 'Submitted',
      received: 'Received',
      shipped: 'Shipped',
      cancelled: 'Cancelled',
      contact: 'Contact your account manager if anything looks wrong.',
    },
    auth: {
      signInTitle: 'Sign in to the Vendor Portal',
      signInSubtitle: 'Use the email your account manager invited.',
      signUpTitle: 'Create your vendor account',
      signUpSubtitle: 'Use the email address that received the invitation. Without an invitation, sign-up will be rejected.',
      noAccess: 'Your account is not linked to a vendor profile yet. Contact your account manager.',
    },
    dashboard: {
      title: 'Dashboard',
      greeting: 'Welcome back',
      newPOs: 'New purchase orders',
      newSamples: 'Sample requests',
      openItems: 'Open items',
      seeAllPOs: 'See all purchase orders',
      seeAllSamples: 'See all sample requests',
    },
    po: {
      title: 'Purchase orders',
      number: 'PO #',
      style: 'Style',
      units: 'Units',
      placedAt: 'Placed',
      due: 'Due',
      status: {
        draft: 'Draft',
        placed: 'Placed',
        in_production: 'In production',
        received: 'Received',
        closed: 'Closed',
        cancelled: 'Cancelled',
      },
      detail: {
        sizeBreak: 'Size break',
        notes: 'Production notes',
        ack: 'Acknowledge this PO',
        ackHint: 'Once you acknowledge, your account manager is notified that you have started production.',
      },
    },
    sample: {
      title: 'Sample requests',
      type: 'Type',
      style: 'Style',
      requestedAt: 'Requested',
      verdict: {
        Pending: 'Pending',
        Approved: 'Approved',
        Rejected: 'Rejected',
        Resubmit: 'Resubmit',
      },
      detail: {
        courier: 'Courier',
        tracking: 'Tracking number',
        notes: 'Internal notes',
      },
    },
    account: {
      title: 'Your account',
      profile: 'Profile',
      preferences: 'Preferences',
      languagePref: 'Preferred language',
      languagePrefHint: 'All emails and portal screens will use this language.',
    },
    notify: {
      newPOSubject: 'New purchase order from Foreign Resource',
      newPOBody: 'A new purchase order is waiting for you in the Vendor Portal.',
      newSampleSubject: 'New sample request from Foreign Resource',
      newSampleBody: 'A new sample request is waiting for you in the Vendor Portal.',
      cta: 'Open the Vendor Portal',
    },
  },
};

export default en;
