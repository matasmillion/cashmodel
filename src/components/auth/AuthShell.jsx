// @ts-check
// AuthShell — minimal brand wrapper used by /sign-in and /sign-up.
// Salt background, Cormorant Garamond display heading, narrow column.
// Identical chrome to /legal/* so the surfaces feel of-a-piece.

/**
 * @param {{ heading: string; eyebrow?: string; children: any }} props
 */
export default function AuthShell({ heading, eyebrow = 'Foreign Resource', children }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F5F0E8',
      color: '#3A3A3A',
      fontFamily: "'Inter', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '64px 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 460, textAlign: 'center' }}>
        <div style={{
          fontSize: 11,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: '#716F70',
          marginBottom: 12,
        }}>
          {eyebrow}
        </div>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 400,
          fontSize: 32,
          lineHeight: 1.15,
          color: '#3A3A3A',
          margin: 0,
          marginBottom: 28,
        }}>
          {heading}
        </h1>
      </div>

      <div style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
      }}>
        {children}
      </div>
    </div>
  );
}

// Brand appearance overrides for Clerk's <SignIn /> and <SignUp />
// components. Clerk supports a granular `appearance` prop; this object
// lines its tokens up with our Salt / Slate / Sand palette.
//
// elements.* selectors target Clerk's internal CSS classes — these
// names are stable across recent Clerk versions.
export const CLERK_APPEARANCE = {
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
    socialButtonsBlockButton: {
      borderColor: '#EBE5D5',
    },
  },
};
