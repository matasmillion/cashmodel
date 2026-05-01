// Brand appearance overrides for Clerk's <SignIn /> and <SignUp />
// when mounted inside the vendor portal. Lined up with the FR Salt /
// Slate / Sand palette per CLAUDE.md.

export const VENDOR_CLERK_APPEARANCE = {
  variables: {
    colorPrimary: '#3A3A3A',
    colorBackground: '#FFFFFF',
    colorText: '#3A3A3A',
    colorTextSecondary: '#716F70',
    colorInputBackground: '#FFFFFF',
    colorInputText: '#3A3A3A',
    borderRadius: '6px',
    fontFamily: "'Inter', sans-serif",
    fontFamilyButtons: "'Inter', sans-serif",
  },
  elements: {
    rootBox: { width: '100%' },
    card: {
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      border: '0.5px solid rgba(58,58,58,0.15)',
      borderRadius: 12,
    },
    headerTitle: {
      fontFamily: "'Cormorant Garamond', Georgia, serif",
      fontWeight: 400,
    },
    formButtonPrimary: {
      background: '#3A3A3A',
      color: '#F5F0E8',
      textTransform: 'none',
      letterSpacing: 'normal',
    },
  },
};
